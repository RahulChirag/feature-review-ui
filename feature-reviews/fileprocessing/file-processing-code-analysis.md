# End-to-End File Processing Code Analysis

## Scope

This document describes what the code does for file processing across backend and frontend.

Included:
- Backend orchestration and queue flow.
- Worker claiming, processing, retries, and maintenance.
- API routes used to read/manage queue and sync run data.
- Frontend services and screens that read and display file-processing state.

Excluded:
- Any behavior not directly shown in the referenced code.

## System Map

- `backend/app/scheduler/tasks.py`: Orchestrates one site workflow and enqueues files.
- `backend/app/services/edms_document_service.py`: Fetches metadata-only documents via EDMS-specific fetchers.
- `backend/app/services/file_queue_service.py`: Upserts queue rows and handles lock/retry-safe enqueue updates.
- `backend/app/services/file_processing_worker_service.py`: Claims pending rows, processes files, and writes final/retry state.
- `backend/app/scheduler/file_worker_dag_manager.py`: Runs maintenance cycle (stale lock rescue, counters, run/site finalization).
- `backend/app/routes/file_queue.py`: Queue stats/list/details/reset endpoints.
- `backend/app/routes/edms_sync_runs.py`: Sync-run stats/list/details endpoints.
- `frontend/src/services/filesProcessingService.js`: Calls file-queue read APIs.
- `frontend/src/services/syncRunService.js`: Calls sync-run read APIs.
- `frontend/src/pages/SharePointManagement/Document_Files_Process/*`: Renders file/sync statuses and details.

## End-to-End Flow (What Happens in Code)

1. Workflow entry
   - `SharePointWorkflow.run_site_workflow(...)` runs stages: validate, create sync run, fetch documents, process-documents stage, update status, cleanup.
2. Metadata fetch
   - `_fetch_documents(...)` calls `EDMSDocumentService.fetch_site_documents(...)`, which returns metadata-only documents and a fetcher instance.
3. Enqueue to processing table
   - `_fetch_documents(...)` transforms each doc into queue payload and calls `FileQueueService.enqueue_files(...)`.
   - Delta checkpoint update is attempted only after full enqueue success.
4. Worker claim
   - `FileProcessingWorkerService.claim_batch(...)` selects `pending` rows with lock/retry gating and marks them `processing`.
5. Worker process
   - Worker executes download/process path and then `complete_file(...)` writes success, retry, or failed outcome.
6. Maintenance cycle
   - `stale_lock_rescue_job()` runs `_rescue_stale_locks`, `_aggregate_active_run_and_site_counters`, `_finalize_completed_sync_runs`, `_propagate_site_verdicts` under a cluster-wide DB lock.
7. Frontend visibility
   - UI reads `/file-queue/files` and `/edms-sync-runs/*` endpoints and renders processing/action badges and counts.

## Core Evidence Snippets

### 1) Workflow stage sequence

```python
# backend/app/scheduler/tasks.py
ctx.current_stage = "create_sync_run"
sync_run = await SharePointWorkflow._create_sync_run(ctx, db)

ctx.current_stage = "fetch_documents"
await SharePointWorkflow._fetch_documents(ctx, db)

ctx.current_stage = "process_documents"
await SharePointWorkflow._process_documents(ctx, db)
```

### 2) Queue-based fetch is metadata-only

```python
# backend/app/scheduler/tasks.py
# Queue-based architecture - fetch metadata only, no content download
documents, fetcher = await EDMSDocumentService.fetch_site_documents(
    db=db,
    site_id=ctx.site_id,
    limit=ctx.fetch_limit,
    skip_processed=ctx.skip_processed,
    sync_run_id=ctx.run_id,
)
```

### 3) Enqueue + delta advance guard

```python
# backend/app/scheduler/tasks.py
enqueued_ids = await queue_service.enqueue_files(
    site_id=ctx.site_id,
    files=files_to_enqueue,
    sync_run_id=ctx.run_id,
)
enqueue_success = len(enqueued_ids) == files_to_enqueue_len

if pending_delta_link and enqueue_success:
    await fetcher._update_delta_link(pending_delta_link)
```

### 4) Process stage is delegated (no-op for direct processing)

```python
# backend/app/scheduler/tasks.py
logger.info(
    f"[{ctx.run_id}] File processing delegated to worker jobs. "
    f"{ctx.files_enqueued} files enqueued for processing."
)
ctx.files_processed = 0
return
```

### 5) Enqueue path handles lock timeout with retries

```python
# backend/app/services/file_queue_service.py
max_retries = 3
for attempt in range(max_retries):
    async with get_fresh_session() as db:
        await db.execute(text("SET innodb_lock_wait_timeout = 10"))
        ...
    if ("1205" in err_str or "Lock wait timeout" in err_str) and attempt < (max_retries - 1):
        wait_time = (attempt + 1) * 2  # 2s, 4s backoff
        await asyncio.sleep(wait_time)
```

### 6) Worker claim conditions and lock semantics

```python
# backend/app/services/file_processing_worker_service.py
claim_conditions = [
    EDMSFileProcessing.processing_status == FileProcessingStatus.PENDING.value,
    or_(EDMSFileProcessing.locked_by.is_(None), EDMSFileProcessing.locked_at < lock_cutoff),
    or_(EDMSFileProcessing.next_retry_at.is_(None), EDMSFileProcessing.next_retry_at <= now),
]

select(EDMSFileProcessing).where(and_(*claim_conditions)).with_for_update(skip_locked=True)
```

### 7) Claim writes processing lock ownership

```python
# backend/app/services/file_processing_worker_service.py
for file in files:
    file.processing_status = FileProcessingStatus.PROCESSING.value
    file.locked_by = self.worker_id
    file.locked_at = now
    file.processing_started_at = now
```

### 8) Completion writes retry / failed behavior

```python
# backend/app/services/file_processing_worker_service.py
if result.get("non_retryable"):
    file_record.retry_count = eff_max
    file_record.processing_status = FileProcessingStatus.FAILED.value
    file_record.next_retry_at = None
else:
    file_record.retry_count = (file_record.retry_count or 0) + 1
    if file_record.retry_count < eff_max:
        backoff_seconds = self.retry_backoff_base_seconds * (2 ** file_record.retry_count)
        file_record.next_retry_at = now + timedelta(seconds=backoff_seconds)
        file_record.processing_status = FileProcessingStatus.PENDING.value
```

### 9) Maintenance cycle under cluster-wide lock

```python
# backend/app/scheduler/file_worker_dag_manager.py
got_lock = (await db.execute(text("SELECT GET_LOCK('file_worker_maintenance', 0)"))).scalar()
if got_lock != 1:
    return

await _rescue_stale_locks(db)
await _aggregate_active_run_and_site_counters(db)
await _finalize_completed_sync_runs(db)
await _propagate_site_verdicts(db)
```

### 10) Manual reset endpoints exist

```python
# backend/app/routes/file_queue.py
@router.post("/files/{file_record_id}/reset")
async def reset_file_for_retry(...):
    success = await service.reset_file_for_retry(file_record_id)

@router.post("/reset-stuck")
async def reset_stuck_files(...):
    file.processing_status = FileProcessingStatus.PENDING.value
```

### 11) Frontend file-processing service calls

```javascript
// frontend/src/services/filesProcessingService.js
const res = await api.get(`/file-queue/files/${fileId}`);
const res = await api.get("/file-queue/files", { params: filters });
```

### 12) Frontend sync-run service calls

```javascript
// frontend/src/services/syncRunService.js
const res = await api.get(`/edms-sync-runs/site/${siteId}`, { params });
const res = await api.get(`/edms-sync-runs/${syncRunId}/details`, { params });
```

### 13) Frontend computes file status counts

```javascript
// frontend/src/pages/SharePointManagement/Document_Files_Process/components/RunFilesPanel.jsx
const stats = {
  completed: list.filter((f) => f.processing_status === "completed").length,
  failed: list.filter((f) => f.processing_status === "failed").length,
  pending: list.filter((f) => f.processing_status === "pending" || !f.processing_status).length,
  processing: list.filter((f) => f.processing_status === "processing").length,
};
```

### 14) Frontend badge mapping for processing status

```javascript
// frontend/src/pages/SharePointManagement/Document_Files_Process/components/FileStatusBadges.jsx
const PROCESSING_STYLES = {
  completed: { label: "Completed" },
  processing: { label: "Processing" },
  failed: { label: "Failed" },
  pending: { label: "Pending" },
};
```

## State and Field Transitions (Code-Grounded)

Based on model/schema and service writes:

- `processing_status`: `pending -> processing -> completed/failed` and `processing -> pending` (retry or stale-lock rescue).
- `action_status`: values used include `new`, `updated`, `skipped`, `deleted` (plus UI-normalized `modified`/`deduplicated` display categories).
- `retry_count`, `max_retries`, `next_retry_at`: used to gate retries and schedule exponential backoff.
- `locked_by`, `locked_at`: set at claim, cleared on completion/reset.
- `error_message`, `error_details`: written on failure paths.
- `index_status`: includes `not_indexed`, `indexed`, `index_failed`.
- `blob_url`, `blob_uploaded_at`: present in model and updated during worker processing pipeline.

## API Surface Used in This Flow

Backend routes directly tied to file-processing visibility/control:

- `GET /file-queue/files`
- `GET /file-queue/files/{id}`
- `GET /file-queue/stats` and `GET /file-queue/processing-stats`
- `POST /file-queue/files/{file_record_id}/reset`
- `POST /file-queue/reset-stuck`
- `GET /edms-sync-runs/site/{site_id}`
- `GET /edms-sync-runs/{sync_run_id}/details`
- `GET /edms-sync-runs/{sync_run_id}`
- `GET /edms-sync-runs/stats` and `GET /edms-sync-runs/sync-runs-stats`

Frontend code in-scope uses read endpoints (`GET`) for files and sync-run data and renders resulting states.

## Terminology (Non-Technical and Technical)

- **Queue**
  - Non-technical: a waiting line of files.
  - Technical: rows in `doc_intel_files_processing` selected by worker claim logic.

- **Worker lock**
  - Non-technical: a sign saying “this worker is handling this file now.”
  - Technical: `locked_by` + `locked_at`, set during claim and checked for stale timeout.

- **Pending**
  - Non-technical: waiting for a worker.
  - Technical: `processing_status = "pending"`.

- **Processing**
  - Non-technical: work is actively running.
  - Technical: `processing_status = "processing"` after claim.

- **Completed**
  - Non-technical: file finished successfully.
  - Technical: `processing_status = "completed"` with completion timestamp and related result fields.

- **Failed**
  - Non-technical: file could not finish.
  - Technical: `processing_status = "failed"` with `error_message` / `error_details`.

- **Retry**
  - Non-technical: try the same file again later.
  - Technical: increment `retry_count`, set `next_retry_at`, move state back to `pending`.

- **Exponential backoff**
  - Non-technical: wait longer after each failure.
  - Technical: next delay grows as `base * (2 ** retry_count)`.

- **Stale lock rescue**
  - Non-technical: recover files stuck because a worker stopped.
  - Technical: maintenance job finds old `locked_at` rows in `processing` and resets them to `pending`.

- **Sync run**
  - Non-technical: one full cycle for a site.
  - Technical: `doc_intel_sync_runs` record created/updated by workflow and maintenance aggregation/finalization.

## What Frontend Actually Does in This Scope

- Fetches all files for a site and shows per-status counts.
- Fetches single-file details when a user opens a file.
- Fetches sync runs and sync-run details.
- Displays statuses via shared badge/text components.
- Does not contain direct mutation calls in the inspected scope to start processing; it reads status/results from backend APIs.

## Referenced Files

- `backend/app/scheduler/tasks.py`
- `backend/app/services/edms_document_service.py`
- `backend/app/services/file_queue_service.py`
- `backend/app/services/file_processing_worker_service.py`
- `backend/app/scheduler/file_worker_dag_manager.py`
- `backend/app/routes/file_queue.py`
- `backend/app/routes/edms_sync_runs.py`
- `backend/app/models/edms_file_processing.py`
- `backend/app/schemas/edms_file_processing.py`
- `frontend/src/services/filesProcessingService.js`
- `frontend/src/services/syncRunService.js`
- `frontend/src/pages/SharePointManagement/Document_Files_Process/components/RunFilesPanel.jsx`
- `frontend/src/pages/SharePointManagement/Document_Files_Process/components/FileStatusBadges.jsx`
