# Feature Explanation: SharePoint Integration

> **Generated from actual code analysis. No assumptions made.**
> **Date:** 2026-03-25

---

## What is this feature?

The SharePoint integration connects the NeuroIQ Admin Portal to Microsoft SharePoint Online via the Microsoft Graph API. It allows administrators to register SharePoint sites (and specific folders within them), browse their structure, and trigger automated document processing workflows. Documents fetched from SharePoint are parsed, chunked, embedded, and indexed into Azure AI Search. The system supports both full and incremental (delta) synchronization, and is one of several EDMS (Enterprise Document Management System) providers alongside Revver, ComplianceWire, OneDrive, and others.

---

## Where does this happen in the code?

| File | Responsibility |
|------|----------------|
| `backend/app/routes/edms_sites.py` | API router with all EDMS site and SharePoint-specific endpoints |
| `backend/app/services/edms_document_service.py` | SharePoint utility methods: token acquisition, site discovery, folder browsing via Microsoft Graph API |
| `backend/app/services/edms_site_service.py` | CRUD operations for EDMS sites, Revver node browsing helper |
| `backend/app/services/document_fetchers/sharepoint_document_fetcher.py` | Core document fetcher: authenticates, resolves site/drive IDs, fetches document metadata via Graph Delta API |
| `backend/app/services/document_fetchers/base_document_fetcher.py` | Abstract base class for all document fetchers, defines `fetch_documents()` contract and shared helpers |
| `backend/app/services/document_fetchers/__init__.py` | Package init exporting all fetcher classes |
| `backend/app/services/file_queue_service.py` | Enqueues fetched file metadata into the processing queue (database rows) |
| `backend/app/services/file_processing_worker_service.py` | Worker that claims queued files, downloads content, parses, and indexes them |
| `backend/app/scheduler/tasks.py` | `SharePointWorkflow` class: orchestrates the full site workflow (validate -> fetch -> process -> index -> cleanup) |
| `backend/app/models/edms_site.py` | SQLAlchemy model for `doc_intel_sites` table |
| `backend/app/models/edms_sync_run.py` | SQLAlchemy model for `doc_intel_sync_runs` table (run-level metrics) |
| `backend/app/models/edms_file_processing.py` | SQLAlchemy model for `doc_intel_files_processing` table (file-level tracking with queue columns) |
| `backend/app/schemas/edms_site.py` | Pydantic schemas for EDMS sites (create, update, output) with `SiteType` enum including `sharepoint` |
| `backend/app/schemas/edms_file_processing.py` | Pydantic schemas for file processing records |
| `backend/app/config/settings.py` | Settings class with `azure_tenant_id`, `azure_api_client_id`, `azure_api_client_secret`, `sharepoint_drive_name`, `sharepoint_domain` |
| `frontend/src/services/edmsService.js` | Frontend API client wrapping all EDMS/SharePoint REST calls |
| `frontend/src/pages/SharePointManagement/SharePoint_Instance/SharePointSites.jsx` | Main sites list page with create/edit/deactivate/trigger actions |
| `frontend/src/pages/SharePointManagement/SharePoint_Instance/components/SiteFormModal.jsx` | Modal form for creating/editing EDMS sites with SharePoint site picker and folder picker |
| `frontend/src/pages/SharePointManagement/SharePoint_Instance/components/SiteInfoModal.jsx` | Read-only detail view of a site |
| `frontend/src/pages/SharePointManagement/SharePoint_Instance/components/RevverNodeBrowser.jsx` | Tree browser for Revver cabinet/drawer/folder nodes (used in SiteFormModal for Revver sites) |
| `frontend/src/pages/SharePointManagement/SharePoint_Sync_Run/SharePointSyncRun.jsx` | Sync run history and details page |
| `frontend/src/pages/SharePointManagement/Document_Files_Process/DocumentFilesProcessing.jsx` | File-level processing status view |
| `frontend/src/pages/SharePointManagement/Document_Metadata/DocumentMetadata.jsx` | Document metadata viewer and editor |
| `frontend/src/pages/SharePointManagement/Document_Classification/DocumentClassification.jsx` | Document classification (categories and document types) management |
| `frontend/src/pages/SharePointManagement/File_Queue/FileQueue.jsx` | File queue dashboard (pending/processing/completed files) |
| `frontend/src/pages/SharePointManagement/Worker_Management/WorkerManagement.jsx` | Worker management dashboard |
| `frontend/src/App.jsx` | Route registration for SharePoint management pages |

---

## Step-by-Step Execution Flow

### Step 1: Authentication - Acquiring a Microsoft Graph API Token

- **File:** `backend/app/services/edms_document_service.py`
- **Function:** `EDMSDocumentService._get_sharepoint_access_token()`
- **What happens:** Uses the MSAL library (`msal.ConfidentialClientApplication`) to acquire an OAuth2 client credentials token from Azure AD. Reads `azure_tenant_id`, `azure_api_client_id`, and `azure_api_client_secret` from application settings. The token is scoped to `https://graph.microsoft.com/.default`. This static method is used for the utility/discovery endpoints (site search, folder browsing).
- **Code snippet:**
```python
app = msal.ConfidentialClientApplication(
    client_id,
    authority=f"https://login.microsoftonline.com/{tenant_id}",
    client_credential=client_secret,
)
result = app.acquire_token_for_client(
    scopes=["https://graph.microsoft.com/.default"]
)
```

The document fetcher (`SharePointDocumentFetcher`) has its own token management in `_get_access_token()` that also uses MSAL but caches the token in-memory with a 5-minute expiry buffer and runs MSAL in a thread pool to avoid blocking the async event loop.

### Step 2: Discovering SharePoint Sites (Admin UI Flow)

- **File:** `backend/app/routes/edms_sites.py` -> `backend/app/services/edms_document_service.py`
- **Function:** `get_sharepoint_sites_by_domain()` route -> `EDMSDocumentService.get_sharepoint_sites_by_domain()`
- **What happens:** When an admin opens the site creation form, the frontend calls `GET /edms-sites/sharepoint/sites?domain=<domain>&search=<term>`. The backend tries three methods in sequence to discover all accessible sites:
  1. **Method 1:** Tenant-wide `GET /sites` with pagination, then client-side domain filtering
  2. **Method 2:** Root site resolution (`GET /sites/{domain}:/`) and recursive subsite traversal (max depth 5)
  3. **Method 3:** OData `$filter` fallback

  If a `search` parameter is provided, results are filtered by site name (case-insensitive) before returning.
- **Code snippet:**
```python
# Method 1: Tenant-wide search
api_url = f"{graph_base_url}/sites"
# Filter by domain
if domain.lower() in web_url.lower() and site_id and site_id not in seen_site_ids:
    site_data = EDMSDocumentService._extract_site_data(site)
```

### Step 3: Browsing SharePoint Folders

- **File:** `backend/app/routes/edms_sites.py` -> `backend/app/services/edms_document_service.py`
- **Function:** `get_sharepoint_folders_by_site()` route -> `EDMSDocumentService.get_sharepoint_folders_by_site()`
- **What happens:** After selecting a SharePoint site, the admin can browse its folder structure. The endpoint `GET /edms-sites/sharepoint/folders?site_id=<id>&folder_path=<path>` resolves the drive ID, then lists children of the given path using `GET /drives/{drive_id}/root/children` or `GET /drives/{drive_id}/root:/{path}:/children`. Only items with a `folder` property are returned. Each folder includes owner information extracted from `createdBy`.

### Step 4: Creating/Registering an EDMS Site

- **File:** `backend/app/routes/edms_sites.py` -> `backend/app/services/edms_site_service.py`
- **Function:** `create_site()` route -> `EDMSSiteService.create()`
- **What happens:** The admin submits a site registration form. The payload includes `site_type` (e.g., "sharepoint" or "revver"), `site_name`, `site_url`, `site_id` (SharePoint site ID), `drive_id`, `folder_id`, `folder` (path), organization, schedule config, and business context fields (category, tags, language, etc.). The service generates a UUID, validates uniqueness of `(site_id, folder_id)`, and inserts into `doc_intel_sites`. For Revver sites, a background task resolves the `folder_id` to a full path via the Revver API.
- **Code snippet:**
```python
created = await EDMSSiteService.create(db, site, user_id=current_user.id)
if created.site_type == "revver" and created.folder_id and not created.folder:
    background_tasks.add_task(_resolve_and_store_revver_folder_path, str(created.id), created.folder_id)
```

### Step 5: Triggering Document Processing Workflow

- **File:** `backend/app/routes/edms_sites.py`
- **Function:** `fetch_and_push_documents()` route
- **What happens:** Admin clicks the sync/process button for a site. The endpoint `POST /edms-sites/{site_id}/fetch-and-push-documents` validates the site exists and is active, checks no sync is already running, then launches `SharePointWorkflow.run_site_workflow()` as a background task. Returns immediately with a `run_id` for tracking.
- **Code snippet:**
```python
await SharePointWorkflow.run_site_workflow(
    site_id=site.id,
    run_id=run_id,
    user_oid=user_oid,
)
```

### Step 6: SharePoint Workflow Execution (6 Stages)

- **File:** `backend/app/scheduler/tasks.py`
- **Function:** `SharePointWorkflow.run_site_workflow()`
- **What happens:** The workflow runs 6 sequential stages within a database session:

  1. **Stage 1 - Validate Site Access:** Loads the site from the database, validates it is active and accessible.
  2. **Stage 2 - Create Sync Run:** Creates a `doc_intel_sync_runs` record with status `processing` and a unique `sync_job_id`.
  3. **Stage 3 - Fetch Documents:** Uses the appropriate document fetcher (e.g., `SharePointDocumentFetcher`) to fetch document metadata from the source system. Returns metadata only (no content download).
  4. **Stage 4 - Process Documents:** Enqueues file metadata into `doc_intel_files_processing` table as pending queue items. Workers then claim and process them.
  5. **Stage 5 - Update Site Status:** Updates `doc_intel_sites` with `last_processed_at`, `last_process_status`, and file count totals. Updates the sync run record with final metrics.
  6. **Stage 6 - Cleanup:** Temporary file cleanup.

  On failure at any stage, the site is marked as `failed` using a fresh database session.

### Step 7: SharePoint Document Fetching (Delta API)

- **File:** `backend/app/services/document_fetchers/sharepoint_document_fetcher.py`
- **Function:** `SharePointDocumentFetcher.fetch_documents()`
- **What happens:** This is the core data retrieval logic:

  1. **Token acquisition:** Calls `_ensure_valid_token()` which uses MSAL to get a Graph API token.
  2. **Site ID resolution:** Uses stored `site_id` from the database, or falls back to resolving from URL via `_get_site_id()`.
  3. **Drive ID resolution:** Uses stored `drive_id`, or fetches it via `_get_drive_id()` (which supports a configurable `sharepoint_drive_name` setting).
  4. **Delta sync:** If a `delta_checkpoint_link` exists on the site, it is used for incremental sync via Microsoft Graph Delta API. If the delta link is expired, it falls back to a full pull.
  5. **Metadata extraction:** For each document returned by the Delta API, `_extract_metadata_for_queue()` builds a metadata dictionary including file name, path, size, etag, ctag, file_id, created/modified datetime, owner info, and site context (category, tags, groups).
  6. **No content download:** In the queue-based architecture, content is NOT downloaded during fetch. Only metadata is returned. Content download happens later during worker processing.
  7. **Delta link storage:** The new delta link is stored in `pending_delta_link` for the caller to persist after successful enqueue.

  The fetcher includes retry logic with exponential backoff for transient errors (429, 500-504), automatic token refresh on 401, and configurable max retries and file size limits via environment variables.

### Step 8: File Queue Enqueue

- **File:** `backend/app/services/file_queue_service.py`
- **Function:** `enqueue_files()`
- **What happens:** After fetch, the file metadata list is passed to the file queue service. For each file:
  - If no existing record exists for `(site_id, file_id)`: INSERT a new row with `processing_status='pending'`
  - If an existing record is `completed`: The file has changed (Delta API only returns changed files), so UPDATE to `pending` to re-process
  - If an existing record is in another status: UPDATE to `pending` to re-process

  This ensures every file returned by the Delta API gets (re)processed.

### Step 9: Worker Processing (Download, Parse, Index)

- **File:** `backend/app/services/file_processing_worker_service.py`
- **What happens:** Worker processes claim batches of `pending` files from the queue using row-level locking (`locked_by`, `locked_at`). For each claimed file:
  1. Download content from SharePoint using the file's web URL and a valid Graph API token
  2. Upload content to Azure Blob Storage
  3. Parse the content using the appropriate file processor (PDF via Document Intelligence or local parser, DOCX, HTML, CSV, etc.)
  4. Chunk the parsed text using `OptimalTableAwareSplitter`
  5. Generate embeddings via Azure OpenAI
  6. Index sections into Azure AI Search via `SearchManager`
  7. Update the file record with `processing_status='completed'`, `index_status='indexed'`, `blob_url`, etc.

  Workers support retry with exponential backoff (`retry_count`, `max_retries`, `next_retry_at`) and stale lock detection.

---

## What is the code ACTUALLY doing?

The SharePoint integration is a multi-layered system spanning backend API routes, services, document fetchers, a processing pipeline, and a React frontend.

**Authentication** uses Azure AD OAuth2 client credentials flow via the `msal` library. The credentials (`azure_tenant_id`, `azure_api_client_id`, `azure_api_client_secret`) are loaded from environment-specific JSON config files (`settings.{APP_ENV}.json`) and can also be resolved from Azure Key Vault. The `azure_api_client_secret` has a Key Vault reference resolution mechanism defined in `settings.py` (lines 270-345). The token scope is `https://graph.microsoft.com/.default` for all Graph API calls.

**Site Discovery** operates through `EDMSDocumentService` static methods. The `get_sharepoint_sites_by_domain()` method on line 250 of `edms_document_service.py` tries three progressive methods to find all sites accessible to the service principal under a given domain. The `get_sharepoint_site_by_url()` on line 511 resolves a specific URL to a Graph API site object. The `get_sharepoint_folders_by_site()` on line 575 lists folder children using the Drive API.

**The EDMS site model** (`doc_intel_sites`) is polymorphic -- the same table stores SharePoint sites, Revver sites, ComplianceWire sites, and others. The `site_type` column (validated by the `SiteType` enum in `schemas/edms_site.py` line 7) differentiates them. SharePoint-specific columns include `site_id` (SharePoint site ID), `drive_id` (document library ID), `folder_id` (specific folder within the drive), and `delta_checkpoint_link` (for incremental sync).

**Document fetching** follows a producer-consumer pattern. The `SharePointDocumentFetcher` (in `sharepoint_document_fetcher.py`) acts as the producer, fetching metadata via the Graph Delta API (`/drives/{drive_id}/root/delta` or `/drives/{drive_id}/items/{folder_id}/delta`). It leverages delta links for incremental sync, which means only changed files are returned on subsequent runs. The fetcher does NOT download file content -- it produces metadata-only records. These are enqueued into `doc_intel_files_processing` by `file_queue_service.py`.

**Worker processing** is the consumer side. Workers claim batches of pending files using database row locking, download content from SharePoint, parse it through a pipeline of parsers and splitters (including Azure Document Intelligence for PDFs and Office documents), generate embeddings, and index into Azure AI Search.

**The frontend** under `frontend/src/pages/SharePointManagement/` provides a full admin interface with 7 sub-pages (Sites, Sync Runs, File Processing, Document Metadata, Document Classification, File Queue, Worker Management). The `edmsService.js` client wraps all API calls with consistent error handling via `normalizeError()`.

**Revver integration** coexists with SharePoint in the same architecture. The `edms_sites.py` route file (lines 527-681) includes Revver-specific endpoints: `GET /revver/browse-nodes`, `GET /revver/webhook-triggers/{site_id}`, and `POST /revver/webhook-triggers/{site_id}/setup`. These endpoints are wired into the same EDMS sites router. The `RevverNodeBrowser.jsx` component provides a tree browser for Revver's cabinet/drawer/folder hierarchy, integrated into the `SiteFormModal.jsx` form. The `_resolve_and_store_revver_folder_path()` background task (line 27 in `edms_sites.py`) resolves a Revver `folder_id` to a human-readable path for display.

---

## Important Notes

- **Delta link expiration:** The code explicitly handles delta link expiration in `sharepoint_document_fetcher.py` (around line 590-599). If the delta link fails, the fetcher falls back to a full document pull and logs the error.
- **Concurrent sync prevention:** Both the API route (`fetch_and_push_documents`) and the workflow (`run_site_workflow`) check `EDMSSyncRunService.is_sync_running()` before starting a new sync to prevent duplicate runs.
- **Token caching:** The `SharePointDocumentFetcher` caches tokens in-memory with a 5-minute expiry buffer (`_token_expires_at` is set to `expires_in - 300` seconds). The utility methods in `EDMSDocumentService` do NOT cache tokens -- they acquire a fresh token per call.
- **Rate limiting:** The fetcher implements retry with exponential backoff for HTTP 429 (Too Many Requests), respecting the `Retry-After` header when present (lines 202-225 of `sharepoint_document_fetcher.py`).
- **Configurable limits:** Max retries, retry delay, max file size, and batch size are configurable via environment variables (`SHAREPOINT_MAX_RETRIES`, `SHAREPOINT_RETRY_BASE_DELAY_SECONDS`, `SHAREPOINT_MAX_FILE_SIZE_MB`, `SHAREPOINT_DOWNLOAD_BATCH_SIZE`).
- **Drive name configuration:** The `sharepoint_drive_name` setting allows targeting a specific document library by name. If not set, the default drive for the site is used.
- **Business context fields:** Sites carry rich metadata (category, tags, language, doc_owner_department, doc_type, region, business_unit, retention_policy, sensitivity_label) that flows through to indexed documents for filtering and access control.
- **RBAC:** All API endpoints require authentication via `get_current_user` dependency. The frontend enforces `site_management` permissions (read, create, edit, deactivate, trigger) via `useAuth().hasPermission()` in `SharePointSites.jsx` (lines 63-67).
- **Site uniqueness:** The `(site_id, folder_id)` combination has a unique constraint in the database (`uq_site_folder` in `edms_site.py` line 152), preventing duplicate registrations of the same folder.
- **No direct SharePoint-Revver interaction:** SharePoint and Revver do not interact with each other directly. They are separate EDMS providers that share the same site management infrastructure, database tables, processing pipeline, and UI components. The `SiteFormModal` conditionally renders different form fields based on `site_type` (SharePoint fields vs. Revver node browser).

---

## Explain Like I'm 10 Years Old

Imagine you have a big digital filing cabinet at work (that is SharePoint). This system is like a helper robot that:

1. First, it learns the password to open the filing cabinet (that is the authentication step).
2. Then it looks at what filing cabinets and folders exist (that is the site and folder discovery).
3. An admin tells the robot "watch this specific folder" by registering it in the system.
4. When told to sync, the robot checks what files have been added or changed since last time (using a special bookmark called a "delta link").
5. It writes down a list of all the new/changed files (just the names and descriptions, not the actual papers yet).
6. Then helper workers go one by one, grab each file, read it, break it into smaller pieces, and put those pieces into a searchable index so people can find information fast.

The robot can watch multiple filing cabinets at once -- not just SharePoint ones, but also Revver ones (a different brand of filing cabinet). They all work the same way on the inside.

---

## Summary

- Entry point: `backend/app/routes/edms_sites.py` -> `router = APIRouter(prefix="/edms-sites")`
- Key files involved:
  - `backend/app/routes/edms_sites.py` (API routes)
  - `backend/app/services/edms_document_service.py` (SharePoint utility methods)
  - `backend/app/services/edms_site_service.py` (EDMS site CRUD)
  - `backend/app/services/document_fetchers/sharepoint_document_fetcher.py` (Graph Delta API fetcher)
  - `backend/app/services/document_fetchers/base_document_fetcher.py` (Abstract fetcher base)
  - `backend/app/services/file_queue_service.py` (File queue management)
  - `backend/app/services/file_processing_worker_service.py` (Worker processing)
  - `backend/app/scheduler/tasks.py` (Workflow orchestration)
  - `backend/app/models/edms_site.py`, `edms_sync_run.py`, `edms_file_processing.py` (Data models)
  - `backend/app/schemas/edms_site.py`, `edms_file_processing.py` (Pydantic schemas)
  - `backend/app/config/settings.py` (Configuration with SharePoint settings)
  - `frontend/src/services/edmsService.js` (API client)
  - `frontend/src/pages/SharePointManagement/` (7 sub-pages with 40+ component files)
- APIs called:
  - Microsoft Graph API v1.0: `GET /sites`, `GET /sites/{id}`, `GET /sites/{host}:{path}`, `GET /sites/{id}/sites` (subsites), `GET /sites/{id}/drives`, `GET /sites/{id}/drive`, `GET /drives/{id}/root/children`, `GET /drives/{id}/root:/{path}:/children`, `GET /drives/{id}/items/{id}`, `GET /drives/{id}/root/delta`, `GET /drives/{id}/items/{id}/delta`
  - Azure AD: `POST https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token` (via MSAL)
- Database operations:
  - `EDMSSite` CRUD in `edms_site_service.py` (table: `doc_intel_sites`)
  - `EDMSSyncRun` create/update in `edms_sync_run_service.py` (table: `doc_intel_sync_runs`)
  - `EDMSFileProcessing` enqueue/claim/update in `file_queue_service.py` (table: `doc_intel_files_processing`)
  - Delta checkpoint link persistence on `doc_intel_sites.delta_checkpoint_link`
- Feature complexity: High
