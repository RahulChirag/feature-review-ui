# Feature Explanation: EDMS Sites Management

> **Generated from actual code analysis. No assumptions made.**
> **Date:** 2026-04-16

---

## What is this feature?

EDMS Sites is the central management system for registering, configuring, and monitoring document source connections in the NeuroIQ Admin Portal. It supports multiple Enterprise Document Management System (EDMS) providers -- SharePoint, Revver (eFileCabinet), OneDrive, Google Drive, ComplianceWire, MyVault, and others. Each "site" represents a specific folder or document library within one of these providers, registered under an organization with credentials, scheduling configuration, and business context metadata. The system provides full CRUD with soft-delete lifecycle, server-side paginated listing via MySQL stored functions, automated scheduling, group OID resolution from Azure AD, bulk site discovery, and status recomputation from actual file processing data.

---

## Where does this happen in the code?

| File | Responsibility |
|------|----------------|
| `backend/app/routes/edms_sites.py` | FastAPI router with all EDMS site CRUD endpoints, SharePoint discovery, Revver browsing, bulk operations, and document workflow triggering |
| `backend/app/services/edms_site_service.py` | Core service class (`EDMSSiteService`) with CRUD, pagination, status recomputation, group OID resolution, scheduler sync, and Revver node browsing |
| `backend/app/models/edms_site.py` | SQLAlchemy model for `doc_intel_sites` table with 30+ columns, relationships to organizations, providers, sync runs, and file processing records |
| `backend/app/schemas/edms_site.py` | Pydantic schemas: `EDMSSiteCreate`, `EDMSSiteUpdate`, `EDMSSiteOut`, `EDMSSiteListItem`, `SiteType` enum (9 types), `ScheduleFrequency` enum, `ProcessStatus` enum |
| `backend/app/services/edms_document_service.py` | SharePoint-specific utility methods: Graph API token acquisition, site discovery, folder browsing |
| `backend/app/services/edms_sync_run_service.py` | Sync run management and running-sync detection |
| `backend/app/scheduler/tasks.py` | `SharePointWorkflow` class orchestrating full site sync workflows |
| `backend/app/services/file_queue_service.py` | File processing queue insertion/update |
| `backend/app/services/file_processing_worker_service.py` | Worker that claims queued files, downloads, parses, and indexes them |
| `frontend/src/services/edmsService.js` | Frontend API client wrapping all EDMS site, provider, sync run, webhook, and bulk operations |
| `frontend/src/pages/SharePointManagement/SharePoint_Instance/SharePointSites.jsx` | Main sites list page with create/edit/deactivate/restore/trigger actions |
| `frontend/src/pages/SharePointManagement/SharePoint_Instance/components/SiteFormModal.jsx` | Modal form for creating/editing sites with SharePoint site picker and folder picker |
| `databases/admin/functions/R__fn_edms_sites.sql` | 14 MySQL stored functions for site listing, filtering, pagination, status counts, and provider lookups |
| `databases/admin/functions/R__fn_edms_providers.sql` | 10 MySQL stored functions for EDMS provider catalog and org-level provider configuration reads |
| `databases/admin/procedures/R__sp_edms_providers.sql` | 11 MySQL stored procedures for EDMS provider CRUD (global catalog + org-scoped configs) |
| `databases/admin/migrations/V004__create_edms_providers.sql` | DDL migration: creates `edms_providers` and `organization_edms_providers` tables, adds FK columns to `doc_intel_sites` |
| `databases/admin/seed/R__seed_10_edms_providers.sql` | Seed data: 6 default provider entries (SharePoint, Revver, OneDrive, Google Drive, ComplianceWire, MyVault) with credential schemas |

---

## Step-by-Step Execution Flow

### Step 1: Provider Architecture (Two-Table Design)

- **Files:** `databases/admin/migrations/V004__create_edms_providers.sql`, `databases/admin/seed/R__seed_10_edms_providers.sql`
- **What happens:** The system uses a two-table architecture modeled after identity providers:
  1. **`edms_providers`** -- Global catalog of EDMS types (SharePoint, Revver, etc.) with `provider_key`, `auth_type`, `base_url`, `credential_schema` (JSON array defining required credential fields), and `configuration`. Seeded with 6 default entries.
  2. **`organization_edms_providers`** -- Per-organization config linking to the global catalog. Stores `credentials` (JSON with actual secrets/refs), `base_url` overrides, `is_enabled` toggle, and validation status.
  Each site row in `doc_intel_sites` has FK references to both `organizations` and `organization_edms_providers`, binding it to a specific org's provider configuration.
- **Code snippet (seed):**
```sql
INSERT INTO edms_providers (id, provider_key, display_name, auth_type, credential_schema, ...)
VALUES
('ep-...-sharepoint01', 'sharepoint', 'SharePoint', 'oauth2_client_credentials',
  JSON_ARRAY(
    JSON_OBJECT('key', 'tenant_id', 'type', 'text', 'required', TRUE),
    JSON_OBJECT('key', 'client_id', 'type', 'text', 'required', TRUE),
    JSON_OBJECT('key', 'client_secret_ref', 'type', 'secret_ref', 'required', TRUE)
  ), ...),
('ep-...-revver000001', 'revver', 'Revver (eFileCabinet)', 'oauth2_ropc', ...)
```

### Step 2: Site Creation

- **Files:** `backend/app/routes/edms_sites.py` -> `backend/app/services/edms_site_service.py`
- **Function:** `create_site()` route -> `EDMSSiteService.create()`
- **What happens:** The admin submits a site registration form. The flow:
  1. Validates the Pydantic schema (`EDMSSiteCreate`) -- requires `organization_id`, `org_edms_provider_id`, `site_type`, `site_name`, `display_name`, `site_url`. Site type is validated against the `SiteType` enum (9 types). Schedule fields are cross-validated (e.g., `schedule_time` required for daily/weekly/monthly).
  2. For Revver sites, validates that `folder_id` is provided (cabinet/folder must be selected).
  3. Enforces uniqueness on `(site_id, folder_id)` -- prevents duplicate registrations and mixed folder/no-folder conflicts.
  4. Generates a UUID, sets `last_process_status="pending"`, zeroes file counts, and inserts into `doc_intel_sites`.
  5. Resolves group OIDs: if the user provided `groups`, resolves them to Azure AD OIDs via `IndexDataEnrichment.resolve_groups_to_oids()` and stores in `source_config.group_oids`. If no groups provided and it's a SharePoint site, auto-detects groups via `EDMSDocumentService.get_sharepoint_site_groups()`.
  6. Syncs the scheduler: if `schedule_frequency` is set and site is active, registers an APScheduler job via `DAGManager`.
  7. For Revver sites, fires a background task (`_resolve_and_store_revver_folder_path`) that calls the Revver API to resolve `folder_id` to a full path string and persists it in the `folder` column.
- **Code snippet:**
```python
new_site = EDMSSite(
    id=str(uuid4()),
    organization_id=site.organization_id,
    org_edms_provider_id=site.org_edms_provider_id,
    site_type=site.site_type,
    site_name=site.site_name,
    ...
    last_process_status="pending",
    files_processed_count=0,
    files_failed_count=0,
)
```

### Step 3: Site Update (with Field Locking)

- **File:** `backend/app/services/edms_site_service.py`
- **Method:** `EDMSSiteService.update()`
- **What happens:** Updates only user-provided fields (via `exclude_unset=True`). Key behaviors:
  1. **Field locking**: Once a site has processed at least 1 file (`files_processed_count >= 1`), critical identity fields become read-only: `site_type`, `site_name`, `site_url`, `site_id`, `drive_id`, `folder`, `folder_id`, `org_edms_provider_id`, `organization_id`. Attempts to change these are silently dropped with a warning log.
  2. **System-managed fields** (`delta_checkpoint_link`, `last_processed_at`, `last_process_status`, `files_processed_count`, `files_failed_count`, `created_at`, `modified_at`, `created_by`, `deleted_at`, `is_active`) are always excluded from user updates.
  3. **Groups append-merge**: The `groups` field uses case-insensitive merge instead of overwrite -- new groups are appended, existing ones preserved.
  4. Group OID re-resolution: If groups change or `source_config.group_oids` is missing, OIDs are resolved and merged.
  5. Scheduler job is synced after update.

### Step 4: Site Listing (Database-Side JSON Functions)

- **Files:** `backend/app/services/edms_site_service.py`, `databases/admin/functions/R__fn_edms_sites.sql`
- **Methods:** `EDMSSiteService.list_paginated()` -> `fn_edms_sites_list_paginated_json()` + `fn_edms_sites_list_total_count()`
- **What happens:** Site listing is performed by MySQL stored functions that return JSON directly, avoiding ORM overhead. The paginated endpoint:
  1. Calls `fn_edms_sites_list_total_count()` with filter params to get the total matching row count.
  2. Calls `fn_edms_sites_list_paginated_json()` with the same filters plus `LIMIT`/`OFFSET` to get the page data.
  3. The MySQL functions handle all filtering (active_only, site_type, deleted_only, inactive_only, include_deleted) and search (case-insensitive LIKE across `site_name`, `display_name`, `site_url`, `owner`, `category`).
  4. Sorting supports multiple columns via CASE-based dynamic ORDER BY: `last_processed_at`, `site_name`, `display_name`, `created_at`, `last_process_status`. NULL handling for `last_processed_at` places nulls last on DESC, first on ASC.
  5. The route layer translates `status=` string param (all/active/inactive) and `provider=` alias for `site_type=`.
- **Code snippet (SQL function):**
```sql
CREATE FUNCTION fn_edms_sites_list_paginated_json(
    p_active_only BOOLEAN, p_site_type VARCHAR(50), p_deleted_only BOOLEAN,
    p_inactive_only BOOLEAN, p_include_deleted BOOLEAN, p_search TEXT,
    p_sort_by VARCHAR(50), p_sort_direction VARCHAR(4), p_limit INT, p_offset INT
) RETURNS JSON READS SQL DATA
BEGIN
    SELECT COALESCE(JSON_ARRAYAGG(ordered_rows.site_json), JSON_ARRAY())
    INTO v_result
    FROM (
        SELECT JSON_OBJECT('id', s.id, 'site_name', s.site_name, ...) AS site_json
        FROM doc_intel_sites s
        WHERE ... -- all filter logic
        ORDER BY ... -- dynamic sorting via CASE
        LIMIT p_limit OFFSET p_offset
    ) AS ordered_rows;
    RETURN v_result;
END
```

### Step 5: Site Detail Retrieval

- **Files:** `backend/app/services/edms_site_service.py`, `databases/admin/functions/R__fn_edms_sites.sql`
- **Method:** `EDMSSiteService.get()` -> `fn_edms_sites_get_by_id_json()`
- **What happens:** Fetches a single site by ID using the MySQL function `fn_edms_sites_get_by_id_json()`. Returns all 35+ columns as a JSON object. Supports `p_include_deleted` flag to optionally include soft-deleted sites. The function result is parsed and hydrated into an `EDMSSite` ORM model via `_site_payload_to_model()`.

### Step 6: Soft-Delete Lifecycle (Deactivate / Restore)

- **File:** `backend/app/services/edms_site_service.py`
- **Methods:** `EDMSSiteService.deactivate()`, `EDMSSiteService.restore()`
- **What happens:**
  - **Deactivate**: Sets `is_active=False`, `deleted_at=now()`. Removes the scheduler job. If the site is already deleted, raises `SITE_ALREADY_DELETED`.
  - **Restore**: Sets `is_active=True`, `deleted_at=None`. Idempotent if already active. Re-registers the scheduler job if the site has a schedule configured.

### Step 7: Status Recomputation

- **Files:** `backend/app/services/edms_site_service.py`, `databases/admin/functions/R__fn_edms_sites.sql`
- **Method:** `EDMSSiteService.recompute_site_status()`
- **What happens:** Recalculates site-level aggregates from actual file processing data (not from sync runs, which are intermediate). Uses 4 MySQL functions:
  1. `fn_edms_sites_count_completed_files(site_id)` -- counts files with `processing_status='completed'`
  2. `fn_edms_sites_count_failed_files(site_id)` -- counts files with `processing_status='failed'`
  3. `fn_edms_sites_get_max_processing_completed_at(site_id)` -- latest `processing_completed_at` timestamp
  4. `fn_edms_sites_count_sync_runs_with_statuses(site_id, statuses_json)` -- checks if site has ever been synced
  Status logic: completed-only = "success", failed-only = "failed", both = "warning", neither but synced = "success", never synced = "pending".
  Also resolves stuck sync runs via `fn_edms_sites_get_processing_runs_without_pending_json()` + `fn_edms_sites_get_completed_failed_counts_by_run_ids_json()`.

### Step 8: Document Workflow Triggering

- **File:** `backend/app/routes/edms_sites.py`
- **Function:** `fetch_and_push_documents()`
- **What happens:** Triggers the standard `SharePointWorkflow.run_site_workflow()` in a background task. Validates the site exists and is active. Checks for already-running syncs via `EDMSSyncRunService.is_sync_running()` (returns 409 if so). Generates a `run_id` UUID and passes the logged-in user's Microsoft Object ID (`external_id`) for OID-based permission population. Returns immediately with the `run_id` for tracking.

### Step 9: Provider Credential Resolution

- **File:** `backend/app/services/edms_site_service.py`
- **Functions:** `_fetch_org_edms_provider()`, `_resolve_keyvault_secret()`
- **What happens:** Provider credentials flow through a multi-layer resolution:
  1. `_fetch_org_edms_provider()` calls `fn_edms_sites_get_org_provider_json()` which JOINs `organization_edms_providers` with `edms_providers` and returns both as a nested JSON object.
  2. Credentials are stored as JSON with `secret_ref` fields (e.g., `client_secret_ref: "revver-client-secret"`).
  3. `_resolve_keyvault_secret()` resolves refs: first checks env var (normalized: `revver-client-secret` -> `REVVER_CLIENT_SECRET`), then falls back to Azure Key Vault via `DefaultAzureCredential`.

### Step 10: Revver Node Browsing

- **File:** `backend/app/services/edms_site_service.py`
- **Function:** `browse_revver_nodes()`
- **What happens:** Enables the admin UI tree browser for Revver cabinets/drawers/folders. The flow:
  1. Fetches `OrganizationEDMSProvider` via `fn_edms_sites_get_org_provider_json()`.
  2. Resolves Key Vault secrets for Revver credentials (`client_secret_ref`, `password_secret_ref`).
  3. Resolves `base_url` from credentials, then provider override, then global catalog via `fn_edms_sites_get_provider_base_url()`.
  4. Creates a temporary `RevverDocumentFetcher` with a mock site, authenticates via OAuth ROPC.
  5. If `node_id` provided: fetches children of that node. Otherwise: fetches account root nodes and their children.
  6. Filters to container types only (Cabinet=2, Drawer=4, Folder=5, File=6) and returns `{id, name, system_type, system_type_name, child_count, has_children}` for each node.

### Step 11: Bulk Site Discovery and Registration

- **File:** `backend/app/routes/edms_sites.py`, `frontend/src/services/edmsService.js`
- **Functions:** `discoverUnregisteredSites()`, `bulkCreateSites()`
- **What happens:** The admin can discover all SharePoint sites accessible to the organization and bulk-register them. Uses `EDMSSiteService.get_registered_keys()` which calls `fn_edms_sites_get_registered_keys_json()` to get already-registered `site_id`s and `site_url`s for dedup. Unregistered sites are presented for selection, then `POST /edms-sites/bulk-create-sites` creates multiple sites in one request.

### Step 12: Frontend API Client

- **File:** `frontend/src/services/edmsService.js`
- **What happens:** Comprehensive API client object with methods for every operation:
  - **Site CRUD**: `createSite()`, `updateSite()`, `deactivateSite()`, `restoreSite()`, `getSite()`, `listSites()`, `listActiveSites()`
  - **Document ops**: `fetchAndPushDocuments()`, `syncSiteStatus()`
  - **SharePoint discovery**: `getSharePointSitesByDomain()`, `getSharePointSiteByUrl()`, `getSharePointFolders()`, `getSharePointFolderById()`
  - **Provider management**: `listGlobalProviders()`, `listOrgProviders()`, `createOrgProvider()`, `updateOrgProvider()`, `deleteOrgProvider()`, `toggleOrgProvider()`
  - **Sync runs**: `getSyncRunById()`, `listSyncRunsForSite()`, `listAllSyncRuns()`
  - **Revver browsing**: `browseRevverNodes()`
  - **Bulk operations**: `discoverUnregisteredSites()`, `bulkCreateSites()`
  - **Blocked sites**: `listBlockedSites()`, `blockSites()`, `deleteBlockedSite()`
  Exports helper constants `EDMS_SITES_LIST_DEFAULT_LIMIT` (100) and `EDMS_SITES_LIST_MAX_LIMIT` (500), plus a `parseListSitesResponse()` utility for backward-compatible parsing.

---

## What is the code ACTUALLY doing?

The EDMS Sites system is a **multi-provider document source registry** that bridges the gap between external document management systems and the NeuroIQ document processing pipeline (Azure Blob Storage -> document parsing -> embedding -> Azure AI Search indexing).

**At the database layer**, the system uses a two-table provider architecture (`edms_providers` for the global catalog, `organization_edms_providers` for per-org credentials) following the identity providers pattern. Site data lives in `doc_intel_sites` with FK references to both tables. All read operations for listing and filtering are implemented as **MySQL stored functions that return JSON directly** (`fn_edms_sites_list_json`, `fn_edms_sites_list_paginated_json`, `fn_edms_sites_get_by_id_json`, etc.), bypassing ORM hydration overhead. The functions handle complex filtering logic (active/inactive/deleted combinations), case-insensitive multi-field search, dynamic CASE-based sorting with NULL placement, and server-side pagination. Status recomputation uses separate counting functions (`fn_edms_sites_count_completed_files`, `fn_edms_sites_count_failed_files`) that aggregate from `doc_intel_files_processing`.

**At the backend service layer**, `EDMSSiteService` is a static-method service class that:
- Calls MySQL functions via `_exec_json_db_function()` and `_exec_scalar_db_function()` which use SQLAlchemy's `func` object to invoke MySQL functions
- Enforces business rules: `(site_id, folder_id)` uniqueness with mixed-folder conflict detection, field locking after first file processing, groups append-merge semantics
- Performs side-effects: Azure AD group OID resolution (user-provided or auto-detected from SharePoint), scheduler job sync via DAGManager, Revver folder path resolution via background tasks
- Handles status recomputation by aggregating from file-level data (not sync runs) with stuck-run detection and resolution

**At the route layer**, all endpoints require authentication (`get_current_user` dependency). The router supports the full CRUD lifecycle plus provider-specific discovery endpoints (SharePoint site/folder browsing via Graph API, Revver node browsing via OAuth ROPC + node traversal). The `fetch-and-push-documents` endpoint triggers the full sync workflow as a background task with concurrency protection (409 if already running).

**At the frontend layer**, `edmsService.js` provides a comprehensive API client with 30+ methods. Error handling is centralized via `handleApiError()` which normalizes errors through `normalizeError()`. The `parseListSitesResponse()` utility handles backward compatibility between the legacy array response format and the current `{items, total, limit, offset}` paginated format.

**The DB function mapping** in `EDMSSiteService` is explicit:
```python
FN_LIST_JSON = "fn_edms_sites_list_json"
FN_LIST_TOTAL_COUNT = "fn_edms_sites_list_total_count"
FN_LIST_PAGINATED_JSON = "fn_edms_sites_list_paginated_json"
FN_GET_BY_ID_JSON = "fn_edms_sites_get_by_id_json"
FN_GET_ACTIVE_SITES_JSON = "fn_edms_sites_get_active_sites_json"
FN_GET_REGISTERED_KEYS_JSON = "fn_edms_sites_get_registered_keys_json"
FN_COUNT_COMPLETED_FILES = "fn_edms_sites_count_completed_files"
FN_COUNT_FAILED_FILES = "fn_edms_sites_count_failed_files"
FN_GET_MAX_PROCESSING_COMPLETED_AT = "fn_edms_sites_get_max_processing_completed_at"
FN_COUNT_SYNC_RUNS_WITH_STATUSES = "fn_edms_sites_count_sync_runs_with_statuses"
```

---

## Important Notes

- **Supported site types**: sharepoint, revver, onedrive, google_drive, compliancewire, myvault, intranet, filesystem, other. Validated via the `SiteType` Pydantic enum.
- **Supported schedule frequencies**: hourly, daily, weekly, monthly, every_minutes, every_seconds. Cross-validated with required companion fields (schedule_time for daily/weekly/monthly, schedule_day_of_week for weekly, etc.).
- **Field locking**: After a site processes its first file (`files_processed_count >= 1`), site identity fields (site_type, site_name, site_url, site_id, drive_id, folder, folder_id, org_edms_provider_id, organization_id) become read-only. This prevents breaking the processing pipeline by changing a site's identity mid-stream.
- **Groups merge semantics**: The `groups` field uses append-merge (case-insensitive dedup) on update, not overwrite. This prevents accidentally removing existing group assignments.
- **Uniqueness constraint**: `(site_id, folder_id)` is enforced at both the database level (unique constraint `uq_site_folder`) and application level (validation before insert/update). Mixed folder conflicts are also detected -- you cannot create a folder-specific site if a root site exists for the same `site_id`, and vice versa.
- **Status recomputation** is file-level, not run-level. It counts from `doc_intel_files_processing` (completed vs failed), not from sync run statuses. This means status is always accurate regardless of run-level status drift.
- **Stuck sync run detection**: `recompute_site_status()` also finds sync runs stuck in "processing" state (no pending/processing files remain) and resolves them to completed/failed/warning based on actual file outcomes.
- **Secret resolution** uses a three-tier fallback: environment variable -> Azure Key Vault (via `DefaultAzureCredential`) -> None (with warning log). Environment variable names are normalized from secret names (e.g., `revver-client-secret` -> `REVVER_CLIENT_SECRET`).
- **Collation handling**: All MySQL functions use explicit `COLLATE utf8mb4_unicode_ci` on string comparisons to prevent collation mismatch errors in multi-charset environments.
- **Pagination defaults**: Backend defaults to `limit=100`, max `500`. Frontend exports `EDMS_SITES_LIST_DEFAULT_LIMIT` (100) and `EDMS_SITES_LIST_MAX_LIMIT` (500).

---

## Explain Like I'm 10 Years Old

Imagine you run a library system that gets books from lots of different bookstores (SharePoint is one bookstore, Revver is another, Google Drive is another). The EDMS Sites system is like your master list of "which bookstores am I getting books from, and which specific shelves in each bookstore should I look at?"

When you want to add a new bookstore shelf to watch, you fill out a form saying which bookstore it is, which shelf, and how often to check for new books (every hour? every day? every Monday?). The system writes this down in its big notebook (the database).

When someone asks "show me all my bookstore shelves," the system flips through its notebook using special fast-lookup pages (MySQL functions) that can filter by "only active ones" or "only SharePoint ones" and sort them however you want.

When it is time to check a shelf for new books, the system uses special keys (credentials stored securely in a vault) to get into each bookstore, looks at the shelf, and puts any new or changed books into a "to-read" pile for the reading robots.

If a bookstore shelf gets broken or you do not need it anymore, you can "deactivate" it (the system remembers it existed but stops checking it). If you change your mind, you can bring it back.

The system is also smart enough to double-check its own homework -- if it thinks it has read 50 books but actually only read 48, the "Sync Status" button recounts everything from scratch and fixes the numbers.

---

## Summary

- Entry point (CRUD): `backend/app/routes/edms_sites.py` -> all REST endpoints under `/edms-sites/`
- Core service: `backend/app/services/edms_site_service.py` -> `EDMSSiteService` class
- Database functions: `databases/admin/functions/R__fn_edms_sites.sql` -> 14 MySQL stored functions
- Database providers: `databases/admin/functions/R__fn_edms_providers.sql` + `databases/admin/procedures/R__sp_edms_providers.sql`
- Provider catalog: `databases/admin/seed/R__seed_10_edms_providers.sql` -> 6 default providers
- Frontend client: `frontend/src/services/edmsService.js` -> 30+ API methods
- Key files involved:
  - `backend/app/routes/edms_sites.py`
  - `backend/app/services/edms_site_service.py`
  - `backend/app/models/edms_site.py`
  - `backend/app/schemas/edms_site.py`
  - `backend/app/services/edms_document_service.py`
  - `backend/app/services/edms_sync_run_service.py`
  - `backend/app/scheduler/tasks.py`
  - `backend/app/services/file_queue_service.py`
  - `frontend/src/services/edmsService.js`
  - `frontend/src/pages/SharePointManagement/SharePoint_Instance/SharePointSites.jsx`
  - `databases/admin/functions/R__fn_edms_sites.sql`
  - `databases/admin/functions/R__fn_edms_providers.sql`
  - `databases/admin/procedures/R__sp_edms_providers.sql`
  - `databases/admin/migrations/V004__create_edms_providers.sql`
  - `databases/admin/seed/R__seed_10_edms_providers.sql`
- Database tables:
  - `doc_intel_sites` -- site registrations (30+ columns)
  - `edms_providers` -- global provider catalog (6 entries)
  - `organization_edms_providers` -- per-org provider credentials
  - `doc_intel_sync_runs` -- sync run tracking (used for status recomputation)
  - `doc_intel_files_processing` -- file-level processing (source of truth for site status)
- Feature complexity: High
