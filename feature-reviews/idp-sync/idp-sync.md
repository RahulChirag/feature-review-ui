# Feature Explanation: IDP Sync

> Generated from actual code analysis. No assumptions made.
> Date: 2026-04-18

---

## What is this feature?

IDP Sync (Identity Provider Synchronization) is the module that pulls users (and optionally groups) from an external identity provider — primarily **Microsoft Azure AD / Entra ID via Microsoft Graph API** — into the NeuroIQ Admin Portal's local database, scoped per organization. Each organization configures its own Azure AD tenant/credentials, and a background scheduler worker picks up queued sync jobs and runs them asynchronously with support for full sync, delta (incremental) sync, checkpoint-based resume, rate-limit handling, and per-batch commits.

Two UI pages drive it:
- **Org IDP Manager** — CRUD for per-org IDP config, manual trigger, connection test.
- **IDP Scheduler** — worker status, pause/resume, scheduled jobs list, sync history and dashboard stats.

---

## Architecture and key components

### Backend (FastAPI, SQLAlchemy async, APScheduler)
- API routes under `/api/sync` and `/api/identity-providers`.
- Service layer coordinates provider lookup, authentication, fetch, transform, upsert.
- Provider abstraction: `BaseIDPProvider` + `AzureADProvider` (MSAL client credentials + httpx to Graph API).
- Scheduler engine registers:
  - `idp_sync_worker` — polls `idp_sync_state` for `pending` rows every 5 min (with exponential backoff up to 15 min).
  - `idp_sync_stale_rescue` — resets stuck `running` syncs back to `pending`.
  - One job per enabled `OrganizationIdentityProvider` that has a cron/frequency schedule.
- Supporting managers: `DeltaTokenManager` (for MS Graph delta tokens), `CheckpointManager` (resumable sync).

### Frontend (React, TanStack Query, shadcn/ui)
- `Org_IDP_Manager.jsx` — config management + manual trigger.
- `IDP_Scheduler.jsx` — dashboard, worker controls, history.
- API wrappers: `idpService.js` (config CRUD + trigger) and `idpSyncService.js` (status, history, worker controls, dashboard stats).

### Database tables
- `identity_providers` — global catalog of provider types.
- `organization_identity_providers` — per-org credentials + schedule.
- `idp_sync_state` — per-sync run tracking (status, stats, retry, checkpoints).
- `idp_sync_checkpoints` — resumable sync checkpoints.
- `idp_delta_tokens` — delta tokens for incremental sync.
- `user_external_identities` — user ↔ external IDP account link.

---

## Where does this happen in the code?

| File | Responsibility |
|------|----------------|
| `backend/app/routes/idp_sync.py` | `/api/sync` routes: trigger, status, cancel, history, worker pause/resume, dashboard stats |
| `backend/app/routes/identity_providers.py` | `/api/identity-providers` routes: CRUD of global catalog + org IDP config, test connection, per-org sync trigger |
| `backend/app/services/idp_sync_service.py` | Core `IDPSyncService`: claim pending syncs, authenticate, fetch, transform, upsert users, update stats, batch commit, cancellation, stale rescue |
| `backend/app/services/identity_provider_service.py` | Config CRUD logic for global catalog + org IDP config + test connection |
| `backend/app/services/idp_providers/base_provider.py` | `BaseIDPProvider` abstract class, `RateLimitInfo`, `SyncStats`, `StreamBatch` |
| `backend/app/services/idp_providers/azure_ad_provider.py` | Azure AD / Microsoft Graph implementation using MSAL + httpx |
| `backend/app/services/idp_providers/factory.py` | Registers provider classes by normalized type key; `create_provider()` factory |
| `backend/app/services/delta_token_manager.py` | `DeltaTokenManager` — persists/validates delta tokens per org+provider+entity |
| `backend/app/services/checkpoint_manager.py` | `CheckpointManager` — save/restore per-sync checkpoints |
| `backend/app/scheduler/idp_sync_dag_manager.py` | Registers per-org scheduled jobs and the system worker/rescue jobs; exponential backoff bookkeeping |
| `backend/app/scheduler/tasks.py` (`IDPSyncWorkflow`, `idp_sync_worker_job`, `idp_sync_stale_rescue_job`) | Functions invoked by APScheduler to enqueue/process syncs |
| `backend/app/models/identity_provider.py` | `IdentityProvider`, `OrganizationIdentityProvider`, `UserExternalIdentity`, `ProviderType` enum |
| `backend/app/models/idp_sync_state.py` | `IdpSyncState` — primary sync-tracking model |
| `backend/app/models/idp_sync_checkpoint.py` | `IdpSyncCheckpoint` model for resumable syncs |
| `backend/app/models/idp_delta_token.py` | `IdpDeltaToken` model for MS Graph delta tokens |
| `backend/app/schemas/idp_sync.py` | Pydantic schemas: `SyncTriggerRequest/Response`, `SyncStateResponse`, `IDPDashboardStats`, etc. |
| `backend/app/schemas/identity_provider.py` | Pydantic schemas for IDP config CRUD + `TriggerSyncRequest/Response` |
| `backend/app/config/idp_sync_settings.py` | `IDPSyncSettings` (batch size, worker intervals, page size, rate-limit, delta, checkpoint, parallelism) + `PROVIDER_GRAPH_URLS` |
| `frontend/src/pages/idpModule/Org_IDP_Manager.jsx` | Org IDP config page (CRUD + manual trigger + test connection) |
| `frontend/src/pages/idpModule/IDP_Scheduler.jsx` | IDP worker dashboard + history + pause/resume + cancel |
| `frontend/src/services/idpService.js` | Frontend wrapper for `/api/identity-providers` |
| `frontend/src/services/idpSyncService.js` | Frontend wrapper for `/api/sync` |
| `frontend/src/App.jsx` | Routes `org-idp-manager` and `idp-scheduler` registered |

---

## Step-by-Step Execution Flow

The documented flow is the **per-organization manual trigger** path, which is the most complete end-to-end path.

### Step 1: User opens the Org IDP Manager page
- **File:** `frontend/src/pages/idpModule/Org_IDP_Manager.jsx:90`
- **Function:** `Org_IDP_Manager()` component
- **What happens:** Loads organizations, auto-selects the first one, then fetches that org's IDP configs via `idpService.listOrgProviders(orgId)`.

### Step 2: User clicks "Sync" and submits options
- **File:** `frontend/src/pages/idpModule/Org_IDP_Manager.jsx:206-221`
- **Function:** `triggerSyncMutation` → calls `idpService.triggerOrgProviderSync(orgId, configId, syncOptions)`
- **Options posted:** `sync_type` (`full`|`delta`|`force_refresh`), `dry_run`, `user_filter`, `max_users`, `include_groups`, `max_groups`.

### Step 3: Frontend service sends the request
- **File:** `frontend/src/services/idpService.js:287-305`
- **Function:** `triggerOrgProviderSync`
- **What happens:** `POST /api/identity-providers/organizations/{orgId}/{configId}/sync` with the sync options body.

### Step 4: Backend route receives and validates
- **File:** `backend/app/routes/identity_providers.py:350-411`
- **Function:** `trigger_org_provider_sync`
- **What happens:**
  1. Looks up the org provider config via `IdentityProviderService.get_org_provider`.
  2. Normalizes `provider_type` (replaces `-` with `_`).
  3. `IDPSyncService.get_existing_active_sync(...)` — if one is already pending/running, returns that instead of duplicating.
  4. Otherwise `IDPSyncService.create_pending_sync(...)` creates an `idp_sync_state` row with `sync_status='pending'` and returns `202 Accepted` with `sync_id`.

### Step 5: Create pending sync state
- **File:** `backend/app/services/idp_sync_service.py:1678-1751`
- **Function:** `IDPSyncService.create_pending_sync`
- **What happens:** Validates organization exists, looks up provider config id, inserts a new `IdpSyncState` with `sync_status='pending'`, stored fields: `organization_id`, `provider_type`, `sync_target`, `sync_type`, `user_filter`, `max_users`, `max_groups`, `started_by`, `retry_count=0`.

### Step 6: Worker backoff reset (if triggered via `/sync/{provider_type}/trigger`)
- **File:** `backend/app/routes/idp_sync.py:129-136`
- **Function:** `trigger_sync`
- **What happens:** After creating pending sync, calls `get_idp_dag_manager().reset_worker_backoff()` so the worker picks it up on the next base-interval tick instead of waiting out the backoff.

### Step 7: Background worker polls for pending syncs
- **File:** `backend/app/scheduler/tasks.py:1875-1908`
- **Function:** `idp_sync_worker_job`
- **What happens:** Every `idp_sync_worker_interval_seconds` (default 300s, backs off to max 900s when idle), opens a DB session and calls `IDPSyncService.process_pending_syncs(max_concurrent=1)`. If syncs are found, calls `dag_manager.reset_worker_backoff()`; otherwise `dag_manager.apply_worker_backoff()`.

### Step 8: Claim and run a pending sync
- **File:** `backend/app/services/idp_sync_service.py:1753-1817+`
- **Function:** `IDPSyncService.process_pending_syncs`
- **What happens:**
  1. Selects `IdpSyncState` rows where `sync_status='pending'` and `next_retry_at` is null or in the past.
  2. Updates the claimed row to `sync_status='running'` and sets `processing_started_at`.
  3. Calls `_update_org_provider_sync_status(...)` so the `OrganizationIdentityProvider.last_sync_status` reflects `running` (visible in UI).
  4. Executes the work (users / groups / both).

### Step 9: Get provider config + authenticate
- **File:** `backend/app/services/idp_sync_service.py:465-526`
- **Function:** `IDPSyncService._get_provider_config_from_db`
- **What happens:** Queries `organization_identity_providers` for the enabled row, builds a config dict with `tenant_id`, `client_id`, `client_secret`, `graph_api_base_url` (from `PROVIDER_GRAPH_URLS["azure_ad"] = "https://graph.microsoft.com/v1.0"`).
- **Then:**
  - `create_provider("azure_ad", config)` in `backend/app/services/idp_providers/factory.py:34-39` instantiates `AzureADProvider`.
  - `AzureADProvider.authenticate()` in `backend/app/services/idp_providers/azure_ad_provider.py:72-92` does an MSAL client-credentials token acquisition against `https://login.microsoftonline.com/{tenant_id}` with scope `https://graph.microsoft.com/.default`.

### Step 10: Fetch users from provider
- **File:** `backend/app/services/idp_sync_service.py:262-371` (inside `sync_users`)
- **Branches:**
  - `delta` sync with an existing token: calls `provider.fetch_delta_users(delta_token=...)`.
  - `full`/`delta` with no token: calls `provider.fetch_users(full_sync=True, limit=user_limit, skip_token=<continuation>)` — resumable via `continuation_token` stored on the last incomplete `IdpSyncState`.
  - `force_refresh`: always starts fresh.
- **Provider implementation:** `backend/app/services/idp_providers/azure_ad_provider.py:194+` (`fetch_users`) — uses `_make_request` which retries on 429 using `Retry-After` header (see `parse_rate_limit_response` at `azure_ad_provider.py:98-126`).

### Step 11: Process users in batches
- **File:** `backend/app/services/idp_sync_service.py:650-767`
- **Function:** `IDPSyncService._process_users`
- **What happens:** Iterates users, calls `_process_user` for each, commits DB every `batch_size` users (`max_users` arg, else `sync_state.max_users`, else `idp_sync_settings.idp_sync_batch_size` = 10). After each batch:
  - Updates `sync_state.total_users_processed / new_users_created / existing_users_updated / disabled_users / errors_encountered`.
  - Checks `_is_sync_cancelled(sync_id)` — if a cancellation has marked the row failed with `"Cancelled"` in `error_details`, the loop returns partial stats early.

### Step 12: Upsert individual user
- **File:** `backend/app/services/idp_sync_service.py:769-882`
- **Function:** `IDPSyncService._process_user`
- **What happens:**
  1. `provider.transform_user(provider_user)` normalizes Graph payload to common shape.
  2. Skips users without email.
  3. Looks for existing `User` by email OR by (`idp_provider_type`, `external_id`).
  4. If found → `_update_existing_user` (fields copied, `is_active` always updated from provider); returns action `updated` / `disabled` / `reactivated`.
  5. If not found → `_create_new_user` creates a row with `user_id=uuid4()`, `org_id`, `email`, `login_type="microsoft"`, `oauth_provider="azure_ad"`, `idp_*` fields, etc.
  6. `_get_or_create_external_identity` upserts a `user_external_identities` row linking the user to the external Azure AD `oid`.

### Step 13: Finalize sync state
- **File:** `backend/app/services/idp_sync_service.py:398-442` (end of `sync_users`)
- **What happens:**
  - If provider returned a `next_skip_token` → `sync_state.continuation_token = next_skip_token`, `sync_status = "partial"`, metadata `{"has_more_pages": True}`.
  - Otherwise → `sync_status = "completed"`, `completed_at = now`, `delta_token` persisted, final counters written.
  - Captures `api_calls_made` and `rate_limit_hits` from `provider.stats`.
  - On any exception → `sync_status = "failed"`, `error_details = str(e)`.

### Step 14: Frontend observes progress
- **Polling via TanStack Query** on `IDP_Scheduler.jsx` at 30-second `refetchInterval`:
  - `idpSyncService.getWorkerStatus()` → `GET /api/sync/worker/status` (`routes/idp_sync.py:489-550`).
  - `idpSyncService.getDashboardStats()` → `GET /api/sync/stats` (`routes/idp_sync.py:280-386`).
  - `idpSyncService.getAllSyncHistory()` → `GET /api/sync/history` (`routes/idp_sync.py:394-481`).
- **Cancel flow:** `idpSyncService.cancelSync(syncId)` → `POST /api/sync/cancel/{sync_id}` (`routes/idp_sync.py:214-272`) — marks `sync_status='failed'` with `error_details = "Cancelled by user {id}"`. The running worker picks this up at its next batch-end cancellation check.

### Step 15 (alternative path): Scheduled sync
- **File:** `backend/app/scheduler/idp_sync_dag_manager.py:91-194`
- **Function:** `IDPSyncDAGManager.sync_jobs_from_database` + `add_or_update_job`
- **What happens at app startup (`backend/app/main.py:97-118`):**
  - `IDPSyncDAGManager(scheduler)` is created.
  - For every enabled `OrganizationIdentityProvider` with `sync_schedule` or `schedule_frequency`, registers an APScheduler cron job id `idp_sync_{org_id}_{provider_type}` whose callable is `IDPSyncWorkflow.run_org_idp_sync` (`backend/app/scheduler/tasks.py:1826-1872`).
  - When the cron fires, `run_org_idp_sync` calls `create_pending_sync(...)` then `process_pending_syncs(org_id=...)` — same downstream path as manual.

---

## What is the code ACTUALLY doing?

- The `/api/sync` router (`backend/app/routes/idp_sync.py:37`) is mounted under `/api` via `backend/app/routes/__init__.py:67` (`api_router.include_router(idp_sync.router)`), so all sync endpoints are under `/api/sync/...`.
- Sync execution is **asynchronous**. Trigger endpoints return HTTP 202 with a `sync_id`. Actual work is done by the APScheduler-driven `idp_sync_worker` (`backend/app/scheduler/tasks.py:1875`). The UI polls status.
- **Single provider implemented.** `backend/app/services/idp_providers/factory.py:47-53` only auto-registers `AzureADProvider`. The Pydantic enum in `backend/app/schemas/idp_sync.py:12-20` lists more types (`google_workspace`, `okta`, `aws_cognito`, `auth0`, `custom`), but no code for those is registered.
- **MSAL client credentials** flow is used — Azure app registration must have `User.Read.All` / `Group.Read.All` application permissions granted at tenant level. See `AzureADProvider.__init__` at `azure_ad_provider.py:24-38`.
- **Delta sync**: when `sync_type="delta"` and `AzureADProvider.supports_delta_sync()` is true, `backend/app/services/idp_sync_service.py:265-290` looks up the last completed sync's `delta_token` and calls `provider.fetch_delta_users(delta_token=...)`. Tokens are also persisted in `idp_delta_tokens` (`backend/app/models/idp_delta_token.py`) with 27-day expiry (`idp_sync_delta_token_expiry_days` at `idp_sync_settings.py:63`).
- **Rate-limit handling**: `AzureADProvider._make_request` at `azure_ad_provider.py:128-188` intercepts 429 responses and calls `handle_rate_limit(...)` which honors the `Retry-After` header, capped at `idp_sync_rate_limit_max_wait_seconds` (default 300s). Up to `idp_sync_rate_limit_max_retries=5` retries.
- **Stale sync rescue**: `idp_sync_stale_rescue_job` (`tasks.py:1911-1931`) periodically calls `IDPSyncService.rescue_stale_syncs()` (`idp_sync_service.py:3432`) to put stuck `running` rows older than `idp_sync_stale_timeout_seconds` (default 1800s = 30 min) back to `pending`.
- **Worker backoff**: handled in `IDPSyncDAGManager.apply_worker_backoff()` / `reset_worker_backoff()` (see `idp_sync_dag_manager.py:26-44`). Base 300s, multiplier 2×, max 900s.
- **Per-org credentials take priority**: `_get_provider_config_from_db` (`idp_sync_service.py:465-526`) prefers `organization_identity_providers.tenant_id/client_id/client_secret`, falling back to global settings (`settings.azure_tenant_id`, etc.) only if org fields are null.
- **Batch size semantics**: in `_process_users` (`idp_sync_service.py:681-694`), `max_users` passed on the sync is treated as a **batch size** for intermediate commits, not a hard cap on users fetched (the fetch cap is `idp_sync_max_users_per_sync`, default 10000). This is surprising but intentional per the code comment and the `Org_IDP_Manager.jsx` default of 100.
- **Frontend permissions** are enforced in both pages via `useAuth().hasPermission(...)`: keys are `idp_config` (read/create/edit/deactivate/trigger) on Org IDP Manager and `idp_worker_management` (read/pause/resume) on the Scheduler page (`Org_IDP_Manager.jsx:94-98`, `IDP_Scheduler.jsx:61-63`).

---

## API Endpoints

All prefixed with `/api`.

### `/api/sync` (`backend/app/routes/idp_sync.py`)
| Method | Path | Purpose | Request body | Response |
|---|---|---|---|---|
| POST | `/sync/{provider_type}/trigger` | Queue a sync for a provider (org-scoped via body) | `SyncTriggerRequest` | `SyncTriggerResponse` (202) |
| GET | `/sync/status/{sync_id}` | Get a specific sync's state | — | `SyncStateResponse` |
| POST | `/sync/cancel/{sync_id}` | Mark a pending/running sync as cancelled | — | `SyncStateResponse` |
| GET | `/sync/stats` | Aggregate dashboard stats for today | — | `IDPDashboardStats` |
| GET | `/sync/history` | All-orgs sync history (paginated, filterable by status) | query: `limit`, `offset`, `status_filter` | `List[SyncStateResponse]` |
| GET | `/sync/worker/status` | Worker running state + backoff info | — | `{running, job_id, next_run_time, base_interval_seconds, current_interval_seconds, max_backoff_seconds, consecutive_empty_polls, is_backing_off}` |
| POST | `/sync/worker/pause` | Pause the `idp_sync_worker` APScheduler job | — | `{success, message, running}` |
| POST | `/sync/worker/resume` | Resume the `idp_sync_worker` APScheduler job | — | `{success, message, running}` |
| GET | `/sync/organizations/{org_id}/history` | Per-org sync history | query: `limit`, `offset`, `status_filter` | `List[SyncStateResponse]` |

### `/api/identity-providers` (`backend/app/routes/identity_providers.py`)
| Method | Path | Purpose |
|---|---|---|
| GET | `/identity-providers/catalog` | List global IDP types |
| GET | `/identity-providers/catalog/{provider_id}` | Get one global IDP |
| POST | `/identity-providers/catalog` | Create a global IDP (admin) |
| PUT | `/identity-providers/catalog/{provider_id}` | Update a global IDP |
| DELETE | `/identity-providers/catalog/{provider_id}` | Delete a global IDP |
| GET | `/identity-providers/organizations/{org_id}` | List org's IDP configs |
| GET | `/identity-providers/organizations/{org_id}/{config_id}` | Get one org IDP config |
| POST | `/identity-providers/organizations/{org_id}` | Create org IDP config |
| PUT | `/identity-providers/organizations/{org_id}/{config_id}` | Update org IDP config |
| DELETE | `/identity-providers/organizations/{org_id}/{config_id}` | Delete org IDP config |
| POST | `/identity-providers/organizations/{org_id}/{config_id}/test-connection` | Test credentials against provider |
| POST | `/identity-providers/organizations/{org_id}/{config_id}/sync` | Queue a sync for this org+config (202) |
| GET | `/identity-providers/users/{user_id}/external-identities` | List a user's IDP links |
| POST | `/identity-providers/users/{user_id}/external-identities` | Link user to external id |
| DELETE | `/identity-providers/users/{user_id}/external-identities/{identity_id}` | Unlink |

---

## Data Models / Schemas

### DB models (`backend/app/models/`)
- **`IdentityProvider`** (`identity_provider.py:57`) — global catalog row: `id`, `name`, `provider_type` (string), `description`, `icon_url`, `is_enabled`.
- **`OrganizationIdentityProvider`** (`identity_provider.py:93`) — per-org row:
  - Credentials: `tenant_id`, `client_id`, `client_secret` (plain text column — see "Important Notes").
  - Sync: `sync_groups`, `max_users`, `max_groups`.
  - Schedule: `sync_schedule` (cron), `schedule_frequency` (`hourly|daily|weekly|monthly|cron`), `schedule_time` (Time), `schedule_day_of_week` (JSON array), `scheduled_sync_type` (`delta|full`).
  - State: `last_sync_at`, `last_sync_status`, `last_sync_error`, `is_enabled`.
  - `domain_hints` (JSON).
- **`UserExternalIdentity`** (`identity_provider.py:186`) — `user_id` ↔ `provider_type` + `external_id` + optional `organization_id`, `last_sync_at`.
- **`IdpSyncState`** (`idp_sync_state.py:45`) — central sync-run table:
  - `provider_type`, `provider_config_id`, `organization_id`, `sync_target` (enum `users|groups|both`), `sync_type` (enum `full|delta|force_refresh`), `user_filter` (enum `all|active_only`), `sync_status` (enum `pending|running|partial|completed|failed|throttled|cancelled`).
  - Config: `dry_run` (int 0/1), `max_users`, `max_groups`.
  - Retry: `retry_count`, `next_retry_at`, `processing_started_at`.
  - Stats: `total_users_processed`, `new_users_created`, `existing_users_updated`, `disabled_users`, `errors_encountered`, `groups_processed`, `groups_created`, `groups_updated`, `group_memberships_synced`, `api_calls_made`, `rate_limit_hits`, `memory_peak_mb`.
  - Resume: `continuation_token`, `delta_token`, `is_resumable`, `last_checkpoint_at`, `sync_metadata`.
  - Audit: `started_by` (FK users), `created_at`, `completed_at`, `last_sync_at`.
  - `UniqueConstraint("provider_type","provider_config_id","sync_status", name="unique_provider_sync")` prevents duplicate pending/running rows for the same key.
- **`IdpSyncCheckpoint`** (`idp_sync_checkpoint.py`) — `sync_id` FK, `entity_type` (`users|groups|memberships`), `checkpoint_data` (JSON), `items_processed`, `items_total`.
- **`IdpDeltaToken`** (`idp_delta_token.py`) — unique (`organization_id`, `provider_type`, `entity_type`), with `delta_link`, `delta_token`, `expires_at`, `is_valid`.

### Pydantic schemas (`backend/app/schemas/`)
- `idp_sync.py`: `ProviderType`, `SyncType`, `SyncStatus`, `SyncTriggerRequest` (`organization_id`, `provider_config_id`, `sync_type`, `dry_run`, `max_users` [1..100000], `include_groups`, `max_groups` [1..10000]), `SyncTriggerResponse`, `SyncStateResponse`, `SyncStats`, `IDPDashboardStats`, `ProviderInfo`, etc.
- `identity_provider.py`: `OrgIdentityProviderCreate/Update/Response`, `GlobalIdentityProviderCreate/Update/Response`, `TriggerSyncRequest/Response`, `TestConnectionResponse`, `UserExternalIdentityResponse`.

---

## Frontend Entry Points

### Routes (`frontend/src/App.jsx`)
- `org-idp-manager` → `Org_IDP_Manager` (lazy-loaded at `App.jsx:83`, route at `App.jsx:313-318`).
- `idp-scheduler` → `IDP_Scheduler` (lazy-loaded at `App.jsx:93`, route at `App.jsx:320-325`).

### Pages
- **`frontend/src/pages/idpModule/Org_IDP_Manager.jsx`**
  - State: `selectedOrgId`, form state, sync-dialog state (`syncOptions`: `sync_type`, `dry_run`, `user_filter`, `max_users`, `include_groups`, `max_groups`).
  - Queries: `organizations` (from `organizationService.list`), `idpConfigs` (from `idpService.listOrgProviders`).
  - Mutations: `createMutation`, `updateMutation`, `deleteMutation`, `testConnectionMutation`, `triggerSyncMutation`.
  - Uses `DataTable`/`useDataTable`, shadcn dialogs, `CronInput` for custom cron.
- **`frontend/src/pages/idpModule/IDP_Scheduler.jsx`**
  - Queries (all `refetchInterval: 30000`): `schedulerStatus`, `idpWorkerStatus`, `idpDashboardStats`, `idpJobs`, `syncHistory`.
  - Mutations: `pauseSchedulerMutation`, `resumeSchedulerMutation` (optimistic updates), `cancelSyncMutation`, `syncFromDbMutation`.
  - Tabs: **Workers** (system jobs `idp_sync_worker`, `idp_sync_stale_rescue`), **Scheduled Jobs** (per-org schedules), **Sync History** (paginated).

### Services
- `frontend/src/services/idpService.js` — all `/identity-providers` endpoints. `triggerOrgProviderSync` at `idpService.js:287`.
- `frontend/src/services/idpSyncService.js` — all `/sync` endpoints. Exports `SYNC_TYPES` and `SYNC_STATUS` enums.

### State management
- **TanStack React Query** (`@tanstack/react-query`) is used throughout: `useQuery` for reads with 30s `refetchInterval`, `useMutation` with `onMutate` optimistic updates for pause/resume, `queryClient.invalidateQueries` after writes.
- Feedback: `useFeedbackContext()` for success/error toasts.
- Auth/permissions: `useAuth().hasPermission(...)`.

---

## External Integrations

### Microsoft Azure AD / Entra ID — Microsoft Graph API
- **Auth library:** `msal` (Python) — `ConfidentialClientApplication` at `azure_ad_provider.py:34-38`.
- **Authority:** `https://login.microsoftonline.com/{tenant_id}`.
- **Scope:** `https://graph.microsoft.com/.default` (`azure_ad_provider.py:76`).
- **Graph API base:** `https://graph.microsoft.com/v1.0` (from `PROVIDER_GRAPH_URLS` at `idp_sync_settings.py:94-98`).
- **HTTP client:** `httpx.AsyncClient` with configurable timeout (`idp_sync_http_timeout_seconds`, default 60s).
- **Pagination:** `@odata.nextLink` / `skip_token`; persisted on `IdpSyncState.continuation_token` across runs (`idp_sync_service.py:332-363`).
- **Delta sync:** Microsoft Graph delta queries; token stored on `IdpSyncState.delta_token` and/or `idp_delta_tokens`.
- **Rate limiting:** Graph returns 429 with `Retry-After` header; handled in `_make_request` (`azure_ad_provider.py:128-188`).

### Other providers
- `ProviderType` enum lists `google_workspace`, `okta`, `saml`, `oidc`, `local` (in `models/identity_provider.py`) and `aws_cognito`, `auth0`, `custom` (in `schemas/idp_sync.py`), but only `azure_ad` has an implementation registered — "Not found in the codebase" for the others.

---

## Error Handling and Edge Cases

- **Existing active sync short-circuit:** `IDPSyncService.get_existing_active_sync` (`idp_sync_service.py:140-159`) returns any pending/running sync; both `trigger_sync` (`routes/idp_sync.py:83-108`) and `trigger_org_provider_sync` (`routes/identity_providers.py:381-392`) return that instead of creating a duplicate.
- **Unique constraint** on `(provider_type, provider_config_id, sync_status)` (`idp_sync_state.py:157-162`) prevents duplicate pending/running syncs at the DB level.
- **Authentication failure:** `AzureADProvider.authenticate()` returns `False` on any error; service raises `"Provider authentication failed"` → sync marked `failed`.
- **Rate limiting:** Up to `idp_sync_rate_limit_max_retries` (default 5) retries honoring `Retry-After`; beyond that raises `"Rate limit exceeded after N retries"` → sync `failed`.
- **Cancellation:** `POST /sync/cancel/{sync_id}` (`routes/idp_sync.py:214-272`) sets `sync_status='failed'` with `error_details="Cancelled by user {id}"`. Running worker checks this every batch via `_is_sync_cancelled` (`idp_sync_service.py:622-648`) and aborts gracefully with partial stats.
- **Stale syncs:** `idp_sync_stale_rescue_job` resets `running` rows older than `idp_sync_stale_timeout_seconds` (default 1800s) back to `pending` via `IDPSyncService.rescue_stale_syncs()`.
- **Users without email** are skipped in `_process_user` (`idp_sync_service.py:818-820`), incrementing a "skipped" counter via `data_quality` tracking but not the `errors_encountered` field.
- **Missing provider_type registration:** `factory.create_provider` raises `ValueError("Provider type '...' not registered")` (`factory.py:34-39`) — surfaces as 500 on the sync row.
- **Organization not found** at `create_pending_sync` (`idp_sync_service.py:1717-1722`) → `HTTPException(404)`.
- **Partial completion:** when provider returns `next_skip_token` the sync is marked `partial` with `sync_metadata = {"has_more_pages": True}` so the next run resumes (`idp_sync_service.py:401-407`).
- **Error details dialog:** `IDP_Scheduler.jsx:1037-1080` shows `error_details` text from `IdpSyncState` in a modal.

---

## Configuration / Environment Variables

### `backend/app/config/idp_sync_settings.py` — `IDPSyncSettings` (loaded from `settings.{env}.json`)
- General:
  - `idp_sync_default_provider` — default `"azure_ad"`.
  - `idp_sync_max_users_per_sync` — 10000.
  - `idp_sync_batch_size` — 10 (intermediate commit size fallback).
  - `idp_sync_worker_interval_seconds` — 300 (base poll).
  - `idp_sync_worker_max_backoff_seconds` — 900.
  - `idp_sync_worker_backoff_multiplier` — 2.
  - `sync_timeout_seconds` — 3600.
  - `idp_sync_http_timeout_seconds` — 60.
- Retry: `idp_sync_max_retries=3`, `idp_sync_retry_backoff_base_seconds=60`.
- Stale detection: `idp_sync_stale_timeout_seconds=1800`, `idp_sync_stale_rescue_interval_seconds=300`.
- Streaming/pagination: `idp_sync_page_size=100`, `idp_sync_stream_buffer_size=500`, `idp_sync_enable_streaming=True`.
- Rate limit: `idp_sync_rate_limit_max_retries=5`, `idp_sync_rate_limit_default_wait_seconds=30`, `idp_sync_rate_limit_max_wait_seconds=300`.
- Delta: `idp_sync_delta_token_expiry_days=27`, `idp_sync_force_full_sync_interval_days=7`, `idp_sync_delta_change_threshold=5000`, `idp_sync_prefer_delta=True`.
- Checkpoints: `idp_sync_checkpoint_interval=500`, `idp_sync_enable_checkpoints=True`, `idp_sync_checkpoint_retention_hours=168`.
- Parallelism: `idp_sync_max_concurrent_api_calls=5`, `idp_sync_max_concurrent_groups=10`, `idp_sync_enable_parallel_membership=True`.
- Monitoring: `idp_sync_log_api_timing=True`, `idp_sync_log_memory_usage=False`.

### Runtime env vars (`backend/app/main.py`)
- `APP_ENV` — selects `backend/app/config/settings.{env}.json`.
- `SCHEDULER_ENABLED` — `"true"`/`"false"`, enables the APScheduler engine.
- `SCHEDULER_START_DELAY_SECONDS` — default 30 (delays scheduler init so Azure health probes pass first).

### Fallback credentials from global `settings` (used only if org fields are null)
- `settings.azure_tenant_id`, `settings.azure_api_client_id` / `settings.azure_client_id`, `settings.azure_api_client_secret` (see `idp_sync_service.py:510-521`).

---

## Important Notes

- **`client_secret` is stored as plain Text** in `organization_identity_providers.client_secret`. The model comment explicitly says *"Should be encrypted in production!"* (`identity_provider.py:131`). This is a code-visible concern, not an assumption.
- **Only Azure AD is implemented** despite the enum advertising other providers.
- **Sync is organization-scoped** — all endpoints under `/api/sync` ultimately require `organization_id` (via body or path). Global-scoped syncs are not supported.
- **The `/api/sync/{provider_type}/trigger` endpoint and `/api/identity-providers/organizations/{org_id}/{config_id}/sync` endpoint are two alternate paths** that both end up calling `create_pending_sync` — the org-scoped path is what the frontend `Org_IDP_Manager.jsx` uses.
- **The `max_users` argument means different things** in different places: on the Pydantic request it sounds like a cap, but `_process_users` treats it as the **batch commit size** when passed in (see code comment `idp_sync_service.py:683-691`).
- **Delta sync requires a prior completed full sync** — without a stored `delta_token`, the service falls back to full sync (`idp_sync_service.py:292-295`).
- **Worker pause is granular:** only `idp_sync_worker` is paused; `idp_sync_stale_rescue` keeps running (`routes/idp_sync.py:555-556`).
- **Frontend permissions:** `idp_config.*` and `idp_worker_management.*` — keys referenced in the UI but their grants live in the RBAC tables, not in code.

---

## Explain Like I'm 10 Years Old

Imagine your school has a big roster of students that lives on the district website, and your classroom also has its own whiteboard list of students. IDP Sync is the thing that every few minutes looks at the district website and copies updates onto the classroom whiteboard — new students get added, students who left get crossed out, and names get corrected.

- The **Org IDP Manager** page is where the teacher writes down which district website to read from and the password to log in.
- The **IDP Scheduler** page is the little robot assistant's status board — is it awake? when does it check next? how many copies has it done today? did any fail?
- The robot is smart: if nothing changed last time, it waits a little longer before checking again (so it doesn't waste time). If it finds a problem, it tries again a few times. If the teacher clicks "Cancel" mid-update, the robot stops politely after finishing the row it's on and writes down how far it got.

---

## Summary

- **Entry points:**
  - Frontend manual: `Org_IDP_Manager.jsx` → `idpService.triggerOrgProviderSync` → `POST /api/identity-providers/organizations/{org_id}/{config_id}/sync` → `routes/identity_providers.py:350` → `IDPSyncService.create_pending_sync`.
  - Backend worker: `idp_sync_worker` APScheduler job → `tasks.idp_sync_worker_job` → `IDPSyncService.process_pending_syncs` → `sync_users` → `AzureADProvider.authenticate/fetch_users` → `_process_users` → DB upsert.
  - Scheduled per-org: `IDPSyncDAGManager` cron job → `IDPSyncWorkflow.run_org_idp_sync` → same service path.
- **Key files involved:** see the table in the "Where does this happen in the code?" section.
- **APIs called:**
  - Internal: `/api/sync/*` and `/api/identity-providers/*`.
  - External: `https://login.microsoftonline.com/{tenant_id}` (MSAL) and `https://graph.microsoft.com/v1.0/*` (Microsoft Graph).
- **Database operations:**
  - `IdpSyncState.insert/update` in `IDPSyncService` (`idp_sync_service.py`).
  - `User.select/insert/update` in `_process_user` (`idp_sync_service.py:823-882`).
  - `UserExternalIdentity.upsert` in `_get_or_create_external_identity` (`idp_sync_service.py:528-576`).
  - `OrganizationIdentityProvider.select/update` in `_update_org_provider_sync_status` (`idp_sync_service.py:578-620`).
  - `IdpDeltaToken.upsert/select` via `DeltaTokenManager`.
  - `IdpSyncCheckpoint.upsert/select` via `CheckpointManager`.
- **Feature complexity:** High — async background worker, multi-provider abstraction, delta/resume semantics, rate-limit handling, per-org scheduling, optimistic UI updates.
