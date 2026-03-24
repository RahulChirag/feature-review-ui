# Feature Explanation: Revver (eFileCabinet) EDMS Integration

> **Generated from actual code analysis. No assumptions made.**
> **Date:** 2026-03-24

---

## What is this feature?

The Revver integration connects the NeuroIQ Admin Portal to Revver (formerly eFileCabinet), an Enterprise Document Management System. It allows the platform to authenticate against a Revver instance via OAuth 2.0, discover files through recursive node traversal, receive real-time change notifications via webhooks, and queue discovered files for downstream indexing (Azure Blob Storage, document parsing, embedding, and Azure AI Search). The integration operates against a live production Revver instance and includes extensive safety guards to prevent accidental full-account crawls during development.

---

## Where does this happen in the code?

| File | Responsibility |
|------|----------------|
| `backend/app/config/settings.py` | Defines all Revver configuration fields (`revver_oauth_application_id`, `revver_username`, `revver_client_secret`, `revver_user_password`, `revver_target_path`, `revver_account_node_id`, `revver_file_count_limit`) and loads secrets from env vars or Key Vault |
| `backend/app/config/settings.dev.json` | Environment-specific Revver config values (target path, account node ID, file count limit) |
| `backend/app/services/document_fetchers/revver_document_fetcher.py` | Core fetcher: OAuth authentication, node traversal, file discovery, metadata extraction, file download, retry logic, audit logs, webhook triggers |
| `backend/app/services/document_fetchers/__init__.py` | Registers `RevverDocumentFetcher` in the fetcher package |
| `backend/app/services/document_fetchers/base_document_fetcher.py` | Abstract base class defining the `fetch_documents()` interface that `RevverDocumentFetcher` implements |
| `backend/app/routes/edms_webhook.py` | Webhook capture endpoint (`POST /edms-webhook/inbound/{path}`) -- receives Revver API Callout payloads, validates auth, stores in `webhook_events` |
| `backend/app/routes/edms_sites.py` | EDMS site CRUD routes plus Revver-specific endpoints: `GET /revver/browse-nodes`, `GET /revver/webhook-triggers/{site_id}`, `POST /revver/webhook-triggers/{site_id}/setup` |
| `backend/app/services/webhook_processor_service.py` | Webhook processor worker: polls pending events, classifies actions via AuditLogs API, resolves file-to-site mapping, routes to upload/delete/move/update handlers that enqueue into `FileQueueService` |
| `backend/app/scheduler/webhook_processor_dag_manager.py` | APScheduler job registration for the webhook processor periodic worker |
| `backend/app/utils/revver_webhook_payload.py` | Extracts `entity_id` and `account_id` from Revver API Callout JSON bodies |
| `backend/app/schemas/edms_webhook.py` | Pydantic models: `RevverWebhookNodePayload`, `RevverFileInfo`, `RevverSystemType`, `RevverAuditAction`, `WebhookActionType` |
| `backend/app/models/webhook_event.py` | SQLAlchemy model for the `webhook_events` table |
| `backend/app/models/edms_site.py` | SQLAlchemy model for `doc_intel_sites` -- stores Revver site config including `source_config`, `folder_id`, `site_type="revver"` |
| `backend/app/models/edms_file_processing.py` | SQLAlchemy model for `doc_intel_files_processing` -- file-level queue tracking |
| `backend/app/models/inbound_integration.py` | SQLAlchemy model for `inbound_integrations` -- registry of webhook endpoints with auth config |
| `backend/app/services/edms_site_service.py` | `browse_revver_nodes()` function for browsing the Revver node tree from the admin UI |
| `backend/app/services/file_queue_service.py` | `FileQueueService.enqueue_files()` -- inserts/updates file records in the processing queue |
| `backend/app/services/file_processing_worker_service.py` | Consumer worker that claims queued files, downloads content, uploads to Azure Blob, parses/chunks/embeds, and indexes in Azure AI Search |
| `frontend/src/pages/SharePointManagement/SharePoint_Instance/components/RevverNodeBrowser.jsx` | Frontend component for browsing the Revver node tree |
| `frontend/src/utils/revverWebhookPayload.js` | Frontend utility for Revver webhook payload handling |

---

## Step-by-Step Execution Flow

### Step 1: Configuration Loading

- **File:** `backend/app/config/settings.py`
- **Class:** `Settings`
- **What happens:** At application startup, the `Settings` class loads Revver credentials from the environment-specific JSON config file (e.g., `settings.dev.json`). Revver has seven configuration fields: `revver_oauth_application_id`, `revver_username`, `revver_client_secret`, `revver_user_password`, `revver_target_path`, `revver_account_node_id`, and `revver_file_count_limit`. Secrets (`revver_client_secret`, `revver_user_password`) are treated as optional and loaded from environment variables (`REVVER_CLIENT_SECRET`, `REVVER_USER_PASSWORD`) first, falling back to JSON config values, with a warning (not a fatal exit) if missing.
- **Code snippet:**
```python
# Optional secrets: loaded from env vars when available, warn-only if missing.
_OPTIONAL_SECRET_ENV_MAP = {
    "revver_client_secret": "REVVER_CLIENT_SECRET",
    "revver_user_password": "REVVER_USER_PASSWORD",
}
```

### Step 2: Credential Resolution (Multi-Layer)

- **File:** `backend/app/services/document_fetchers/revver_document_fetcher.py`
- **Method:** `__init__()` and `_resolve_secret()`
- **What happens:** When a `RevverDocumentFetcher` is instantiated, credentials are resolved in a layered priority order: (1) provider-level credentials from the database (`OrganizationEDMSProvider.credentials`), (2) site-level `source_config`, (3) global settings. For secrets referenced by Key Vault name (e.g., `client_secret_ref`), the `_resolve_secret()` class method checks: in-memory process-lifetime cache, then environment variable (normalized: `revver-client-secret` becomes `REVVER_CLIENT_SECRET`), then direct Azure Key Vault lookup via `DefaultAzureCredential`.
- **Code snippet:**
```python
self.client_id = (
    creds.get("oauth_application_id")
    or source_config.get("oauth_application_id")
    or getattr(settings, "revver_oauth_application_id", None)
)
self.client_secret = (
    self._resolve_secret(creds.get("client_secret_ref"))
    or settings.revver_client_secret
)
```

### Step 3: OAuth 2.0 Authentication (Three-Step Flow)

- **File:** `backend/app/services/document_fetchers/revver_document_fetcher.py`
- **Methods:** `_authenticate()`, `_authenticate_inner()`, `_get_access_token()`
- **What happens:** Authentication follows a three-step ROPC (Resource Owner Password Credentials) flow, serialized by an async lock to prevent concurrent OAuth handshakes:
  1. `POST /Token` with `grant_type=password`, `client_id`, `client_secret`, `username`, `password` -- returns `access_token`, `refresh_token`, `expires_in`
  2. `GET /api/Authentication?accessToken={token}` -- lists available Revver accounts
  3. `POST /api/Authentication` with Bearer token and selected account body -- selects the active account, returning the `accountID`
- **Code snippet:**
```python
token_url = f"{self.base_url}/Token"
form_data = {
    "grant_type": "password",
    "client_id": self.client_id,
    "client_secret": self.client_secret,
    "username": self.username,
    "password": self.password,
}
```

### Step 4: Token Refresh and Auto-Renewal

- **File:** `backend/app/services/document_fetchers/revver_document_fetcher.py`
- **Methods:** `_refresh_access_token()`, `_make_request()`
- **What happens:** The `_make_request()` method automatically checks token expiration before every API call. If expired, it calls `_refresh_access_token()` which sends `POST /Token` with `grant_type=refresh_token`. If refresh fails, it falls back to full re-authentication. On 401 responses, the retry wrapper (`_make_request_with_retry()`) also triggers re-authentication with one retry.

### Step 5: Node Traversal / File Discovery (Bulk Scan)

- **File:** `backend/app/services/document_fetchers/revver_document_fetcher.py`
- **Methods:** `fetch_documents()`, `_resolve_target_path_to_node()`, `_traverse_nodes_recursive()`
- **What happens:** The `fetch_documents()` method is the main entry point for bulk file discovery:
  1. Authenticates against Revver
  2. Resolves the starting node: either uses a direct `folder_id`/`starting_node_id` override, or walks the `revver_target_path` segments (e.g., `["Departments", "IT", "Data Strategy"]`) from the account root via `_resolve_target_path_to_node()`
  3. Recursively traverses the node hierarchy via `_traverse_nodes_recursive()`, calling `GET /api/Node/Children` with pagination (`start`/`count` params, page size 4000)
  4. For each child: if `systemType == 7` (FileInfo), adds to discovered files; if `systemType in {2,4,5,6}` (Cabinet/Drawer/Folder/File container), recurses deeper
  5. Applies dev safety limits: max files (`DEV_TRAVERSAL_MAX_FILES=100`) and max depth (`DEV_TRAVERSAL_MAX_DEPTH=5`) unless `REVVER_PRODUCTION_MODE=true`
  6. Filters for supported file extensions, performs change detection (ModifiedOn + Size + FileVersionCount comparison), and extracts metadata

- **Code snippet:**
```python
for child in children:
    sys_type = child.get("SystemType") or child.get("systemType") or 0
    if sys_type == self.SYSTEM_TYPE_FILE_INFO:
        _files_found.append(child)
    elif sys_type in self.CONTAINER_TYPES:
        child_id = str(child.get("NodeID") or child.get("nodeID") or ...)
        if child_id:
            await self._traverse_nodes_recursive(child_id, depth + 1, max_depth, _files_found)
```

### Step 6: Revver Node Browsing (Admin UI)

- **File:** `backend/app/services/edms_site_service.py`
- **Function:** `browse_revver_nodes()`
- **What happens:** The admin UI provides a tree browser for Revver nodes. The route `GET /edms-sites/revver/browse-nodes` calls `browse_revver_nodes()` which authenticates a temporary `RevverDocumentFetcher` using the provider credentials, then fetches child nodes (or root account nodes if no `node_id` is provided). Only container types (Cabinet=2, Drawer=4, Folder=5, File=6) are returned for browsing. The frontend component `RevverNodeBrowser.jsx` renders this tree.

### Step 7: Webhook Capture (Phase A -- Inbound)

- **File:** `backend/app/routes/edms_webhook.py`
- **Function:** `inbound_webhook_capture()`
- **What happens:** When Revver fires an API Callout trigger (configured on a node), it sends a POST to `/api/edms-webhook/inbound/{endpoint_suffix}`. The handler:
  1. Looks up the `InboundIntegration` by `endpoint_path`
  2. Validates authentication (IP allowlist, API key, or both) via `_authenticate_request()`
  3. Parses the JSON body and extracts `entity_id` and `account_id` via `extract_entity_and_account()`
  4. Creates a `WebhookEvent` record with `processing_status="pending"` and stores the full payload + headers
  5. Returns a success response to Revver with the `systemType`, `entityId`, and `accountId`

- **Code snippet:**
```python
event = WebhookEvent(
    id=str(uuid.uuid4()),
    integration_id=integration.id,
    provider=integration.partner,
    entity_id=entity_id,
    account_id=account_id,
    event_payload=body,
    event_headers=headers_dict,
    processing_status="pending",
    received_at=received_at,
)
```

### Step 8: Webhook Trigger Setup

- **File:** `backend/app/routes/edms_sites.py` and `backend/app/services/document_fetchers/revver_document_fetcher.py`
- **Functions:** `setup_revver_webhook_trigger()`, `create_webhook_trigger()`
- **What happens:** The admin UI can set up webhook triggers on Revver nodes via `POST /edms-sites/revver/webhook-triggers/{site_id}/setup`. This calls `fetcher.create_webhook_trigger()` which sends `POST /api/NodeTrigger/{nodeId}` with a body specifying `triggerType: "EventTrigger"`, `actionType: "ApiCallout"`, the webhook URL, and event codes `[100 (FileUpload), 4 (Delete), 13 (Move), 3 (Update)]` with `inheritanceBehavior: "AppliesToAllChildren"`.

- **Code snippet:**
```python
body = {
    "triggerType": "EventTrigger",
    "actions": [{
        "actionType": "ApiCallout",
        "url": webhook_url,
        "method": "POST",
        "contentType": "application/json",
    }],
    "events": events,  # [100, 4, 13, 3]
    "inheritanceBehavior": "AppliesToAllChildren",
}
```

### Step 9: Webhook Processing (Phase B -- Worker)

- **File:** `backend/app/services/webhook_processor_service.py`
- **Class:** `WebhookProcessorWorker`
- **Method:** `process_batch()`
- **What happens:** A periodic APScheduler job (registered by `WebhookProcessorDAGManager`) runs every `webhook_processor_interval_seconds` (default 30s). The worker:
  1. Polls pending Revver webhook events using `SELECT ... WHERE processing_status='pending' ... FOR UPDATE SKIP LOCKED` (FIFO by `received_at`)
  2. Marks claimed events as `"processing"` immediately
  3. Loads all active Revver sites and builds a site path cache by resolving `folder_id` via `get_node_path()`
  4. For each event, calls `_process_event()` which:
     a. Validates the payload via `RevverWebhookNodePayload` Pydantic model
     b. Skips folder events (`systemType=6`)
     c. Resolves the file path via `get_node_path()`
     d. Matches the file to the most specific Revver site using longest-prefix matching in `resolve_site_for_file()`
     e. Classifies the action by calling `GET /api/AuditLogs/{nodeId}` and mapping action codes via `classify_audit_action()`
     f. Routes to the appropriate handler

### Step 10: Action Routing and File Queue Insertion

- **File:** `backend/app/services/webhook_processor_service.py`
- **Functions:** `_handle_upload()`, `_handle_delete()`, `_handle_move()`, `_handle_update()`
- **What happens:** Each handler builds a file metadata dict and enqueues it via `FileQueueService.enqueue_files()`:
  - **Upload**: Creates a `file_dict` with `action_status="new"`, including file path resolved from the API, and enqueues for download + indexing
  - **Delete**: Creates a `file_dict` with `action_status="deleted"` so the worker removes it from the search index
  - **Move**: Resolves the new path and enqueues with `action_status="updated"` for re-indexing with updated path metadata
  - **Update**: Enqueues with `action_status="updated"` for content re-download and re-indexing

### Step 11: File Queue Processing (Consumer Pipeline)

- **File:** `backend/app/services/file_queue_service.py` and `backend/app/services/file_processing_worker_service.py`
- **Class:** `FileQueueService`, `FileProcessingWorkerService`
- **What happens:** `FileQueueService.enqueue_files()` implements conditional insert/update logic: new files are inserted with `processing_status="pending"`, existing files are updated back to `"pending"`. The consumer worker (`FileProcessingWorkerService`) then claims pending files using database locking, downloads content (via `RevverDocumentFetcher.download_file()`), uploads to Azure Blob Storage, parses/chunks the document, generates embeddings, and indexes in Azure AI Search. Failed files are retried up to `file_max_retries` (default 3) with exponential backoff.

### Step 12: File Download from Revver

- **File:** `backend/app/services/document_fetchers/revver_document_fetcher.py`
- **Methods:** `download_file()`, `_get_one_time_token()`
- **What happens:** File download uses a two-step flow:
  1. `POST /api/OneTimeToken` -- generates a short-lived download token
  2. `GET /api/FileDownload/{fileInfoId}/{oneTimeToken}` -- downloads the file content (with a query-param fallback: `GET /api/FileDownload?id={id}&accessToken={token}` if the path-style URL returns 404)
  If the OneTimeToken endpoint is unavailable (404/501/405), the regular access token is used instead.

---

## What is the code ACTUALLY doing?

The Revver integration is a two-phase architecture:

**Phase A (Inbound Webhook Capture):** Revver API Callout triggers fire on file events (upload, delete, move, update) and POST node data to the NeuroIQ webhook endpoint. The webhook route in `edms_webhook.py` validates authentication (IP allowlist and/or API key), extracts the `entity_id` and `account_id` from the payload using `revver_webhook_payload.py`, and stores the full event in the `webhook_events` table with `processing_status="pending"`.

**Phase B (Async Event Processing):** A scheduled APScheduler job (`WebhookProcessorDAGManager` in `webhook_processor_dag_manager.py`) runs every 30 seconds. The `WebhookProcessorWorker` polls pending events with `FOR UPDATE SKIP LOCKED` for concurrency safety, validates the Pydantic payload schema (`RevverWebhookNodePayload`), skips folder events, resolves the file path via `GET /api/Node/GetPathById/{id}`, matches the file to the most specific Revver site using longest-prefix path matching in `resolve_site_for_file()`, classifies the action by querying `GET /api/AuditLogs/{nodeId}` (since Revver webhooks do NOT include action type), and routes to upload/delete/move/update handlers that insert into the file processing queue.

**Bulk Scan Path:** In addition to webhook-driven processing, the `fetch_documents()` method in `RevverDocumentFetcher` provides a full traversal scan. It resolves the starting node from either a direct `folder_id` or by walking `revver_target_path` segments, then recursively traverses the node hierarchy (Cabinets -> Drawers -> Folders -> Files -> FileInfo) using `GET /api/Node/Children`. It filters by supported file extensions, performs change detection comparing `ModifiedOn`, `Size`, and `FileVersionCount` against previously completed records, and returns metadata dicts for queue insertion.

**Credential management** is multi-layered: provider-level DB credentials override site-level `source_config`, which overrides global settings, which can be overridden by environment variables. Key Vault secrets are cached at the process level and resolved via `DefaultAzureCredential`.

**The Revver API endpoints used are:**
- `POST /Token` -- OAuth token acquisition/refresh
- `GET /api/Authentication` -- list accounts
- `POST /api/Authentication` -- select account
- `GET /api/Node/Data` -- get workspace root nodes
- `GET /api/Node/Children?id={id}&start={n}&count={n}` -- paginated child nodes
- `GET /api/Node?id={id}` -- single node by ID
- `GET /api/Node/GetPathById/{id}` -- full path resolution
- `POST /api/NodeBatch/GetChildren` -- batch children fetch
- `GET /api/AuditLogs/{nodeId}` -- audit log entries
- `GET /api/NodeTrigger/{nodeId}` -- list triggers
- `POST /api/NodeTrigger/{nodeId}` -- create trigger
- `GET /api/NodePermissions/NodeId/{id}` -- node permissions
- `GET /api/Role/Account/{accountId}` -- account roles
- `POST /api/OneTimeToken` -- download token
- `GET /api/FileDownload/{fileInfoId}/{token}` -- file download

---

## Important Notes

- The Revver instance at `account.efilecabinet.net` is PDMI's LIVE PRODUCTION environment containing approximately 76,000 real files. There is NO sandbox/staging Revver instance available. All API calls hit production.
- Dev safety limits are enforced: `DEV_TRAVERSAL_MAX_FILES=100`, `DEV_TRAVERSAL_MAX_DEPTH=5`. In non-prod environments, `revver_target_path` must have at least 4 segments to prevent accidental full-account crawls. Set `REVVER_PRODUCTION_MODE=true` to remove dev caps.
- Revver webhook payloads do NOT include the action type (upload vs delete vs move). The `WebhookProcessorWorker` must call the AuditLogs API separately to classify each event.
- The webhook processor runs as a single sequential worker (not parallel) to avoid duplicate AuditLogs API calls for the same node.
- Token refresh has a fallback: if `refresh_token` fails, full re-authentication is performed. On 401 responses, re-auth is attempted once before failing.
- The `_make_request_with_retry()` method retries on 401 (re-auth, once), 429 (rate limit), and 5xx errors with exponential backoff (`base_delay * 2^attempt`). Network errors (`ConnectError`, `ReadTimeout`) are also retried.
- Site-to-file resolution uses longest-prefix path matching with cabinet-level priority (first two path segments like `PDMI/Departments`).
- The `batch_query_nodes()` and `batch_query_permissions()` methods are defined but raise `NotImplementedError` -- they are planned but not yet implemented.
- `revver_file_count_limit` in settings allows capping files per site during traversal (e.g., `"10"` for dev testing).
- The file queue supports conditional insert/update: new files get `processing_status="pending"`, existing files are reset to `"pending"` when re-enqueued.
- Webhook authentication supports three methods: `none`, `ip_allowlist`, `api_key`, and `api_key+ip` (combined).
- The `InboundIntegration` model stores `api_key_hash` (SHA-256), `ip_allowlist` (JSON array of CIDR ranges), and `failure_count` for monitoring.

---

## Explain Like I'm 10 Years Old

Imagine you have a huge filing cabinet at your office (that is Revver) with thousands of folders and papers inside. You want a smart robot (NeuroIQ) to read all those papers and remember what is in them so people can search for information later.

First, the robot needs a key to get into the filing cabinet. It shows its ID card (username + password + client ID + secret) to the security guard, who gives it a temporary pass (access token). This pass expires after a while, so the robot knows how to get a new one without going through the full security check again.

Next, the robot opens the filing cabinet and looks through all the drawers and folders one by one, writing down the name, size, and last-changed date of every paper it finds. It is smart enough to skip papers it has already read that have not changed.

But the robot does not want to check the entire filing cabinet every hour. Instead, it puts a little bell (webhook trigger) on the cabinet. Whenever someone puts in a new paper, takes one out, or moves one around, the bell rings and sends a message to the robot saying "something changed!" The robot then checks what exactly happened by looking at the activity log, and only processes that one paper instead of re-reading everything.

The robot puts every paper it needs to read into a "to-do" pile (the file queue). A team of helper robots picks up papers from the pile, reads them, makes notes (chunks + embeddings), and files the notes in a searchable catalog (Azure AI Search) so anyone can find information quickly.

---

## Summary

- Entry point (bulk scan): `backend/app/services/document_fetchers/revver_document_fetcher.py` -> `RevverDocumentFetcher.fetch_documents()`
- Entry point (webhook capture): `backend/app/routes/edms_webhook.py` -> `inbound_webhook_capture()`
- Entry point (webhook processing): `backend/app/services/webhook_processor_service.py` -> `WebhookProcessorWorker.process_batch()`
- Entry point (node browsing): `backend/app/services/edms_site_service.py` -> `browse_revver_nodes()`
- Key files involved:
  - `backend/app/config/settings.py`
  - `backend/app/services/document_fetchers/revver_document_fetcher.py`
  - `backend/app/services/webhook_processor_service.py`
  - `backend/app/routes/edms_webhook.py`
  - `backend/app/routes/edms_sites.py`
  - `backend/app/schemas/edms_webhook.py`
  - `backend/app/utils/revver_webhook_payload.py`
  - `backend/app/scheduler/webhook_processor_dag_manager.py`
  - `backend/app/services/file_queue_service.py`
  - `backend/app/services/file_processing_worker_service.py`
  - `backend/app/models/webhook_event.py`
  - `backend/app/models/edms_site.py`
  - `backend/app/models/edms_file_processing.py`
  - `backend/app/models/inbound_integration.py`
  - `backend/app/services/edms_site_service.py`
  - `frontend/src/pages/SharePointManagement/SharePoint_Instance/components/RevverNodeBrowser.jsx`
- APIs called:
  - `POST /Token` (Revver OAuth)
  - `GET /api/Authentication`, `POST /api/Authentication` (account selection)
  - `GET /api/Node/Data`, `GET /api/Node/Children`, `GET /api/Node`, `GET /api/Node/GetPathById/{id}`
  - `POST /api/NodeBatch/GetChildren`
  - `GET /api/AuditLogs/{nodeId}`
  - `GET /api/NodeTrigger/{nodeId}`, `POST /api/NodeTrigger/{nodeId}`
  - `GET /api/NodePermissions/NodeId/{id}`
  - `GET /api/Role/Account/{accountId}`
  - `POST /api/OneTimeToken`, `GET /api/FileDownload/{id}/{token}`
- Database operations:
  - `WebhookEvent` INSERT in `edms_webhook.py`
  - `WebhookEvent` SELECT + UPDATE in `webhook_processor_service.py`
  - `EDMSSite` SELECT/UPDATE in `webhook_processor_service.py` and `edms_sites.py`
  - `InboundIntegration` SELECT in `edms_webhook.py`
  - `EDMSFileProcessing` INSERT/UPDATE via `FileQueueService.enqueue_files()`
  - `OrganizationEDMSProvider` SELECT in `webhook_processor_service.py` and `edms_site_service.py`
- Feature complexity: High
