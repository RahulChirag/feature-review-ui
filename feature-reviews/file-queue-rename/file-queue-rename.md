# Feature Explanation: File Queue — File Rename

> Generated from actual code analysis. No assumptions made.
> Date: 2026-06-03

---

## What is this feature?

**File Rename** lets an admin change the display name (`file_name`) of a file record in the `doc_intel_files_processing` SQL table directly from the File Queue UI. This is a **display-name-only change** — it does not move the underlying blob in Azure Storage or rename the source file in SharePoint. The rename is called in parallel alongside the Azure Search metadata update when the `sourcefile` field is changed in the Edit Metadata modal.

The flow goes from `useFileQueueEditMetadata.js` → `fileQueueDocumentActionsService.renameFile()` → `PATCH /api/file-queue/files/{fileRecordId}/rename` → `FileQueueService.rename_file()` → SQL `UPDATE`.

---

## Architecture and Key Components

### System Map

| Layer | File | Responsibility |
|---|---|---|
| Hook | `frontend/src/.../useFileQueueEditMetadata.js` | Detects `sourcefile` change, fires `renameFile` in parallel |
| Actions Service | `frontend/src/.../fileQueueDocumentActionsService.js` | `renameFile()` — fires PATCH HTTP request |
| Backend Route | `backend/app/routes/file_queue.py` | Thin delegation wrapper; maps `FileNotFoundError` to 404 |
| Backend Service | `backend/app/services/file_queue_service.py` | `rename_file()` — queries row, mutates, commits |
| Schema (Request) | `backend/app/schemas/edms_file_processing.py` | `RenameFileRequest` — validates and strips whitespace |
| Schema (Response) | `backend/app/schemas/edms_file_processing.py` | `RenameFileResponse` — success + audit trail |
| DB Model | `backend/app/models/edms_file_processing.py` | `EDMSFileProcessing.file_name` column |

---

## Where Does This Happen in the Code?

| File | Responsibility |
|---|---|
| `frontend/src/pages/SharePointManagement/File_Queue/hooks/useFileQueueEditMetadata.js` | `handleSubmit` detects sourcefile change and fires `renameFile` |
| `frontend/src/pages/SharePointManagement/File_Queue/services/fileQueueDocumentActionsService.js` | `renameFile()` issues the PATCH request |
| `backend/app/routes/file_queue.py` | `rename_file` route handler |
| `backend/app/services/file_queue_service.py` | `rename_file` method — all DB logic |
| `backend/app/schemas/edms_file_processing.py` | `RenameFileRequest`, `RenameFileResponse` |

---

## Step-by-Step Execution Flow

### Step 1 — The Frontend Detects a Sourcefile Change

In `handleSubmit` within `useFileQueueEditMetadata.js`, the hook compares the current `sourcefile` value to what was loaded from Azure Search when the modal opened:

```javascript
// frontend/src/.../hooks/useFileQueueEditMetadata.js
const newSourcefile = formData.sourcefile.trim();
const sourcefileChanged =
  Boolean(newSourcefile) &&
  newSourcefile !== originalSourcefileRef.current &&  // ← compares to value stored on modal open
  Boolean(file?.id);
```

`originalSourcefileRef.current` is set when metadata loads from Azure Search:

```javascript
// frontend/src/.../hooks/useFileQueueEditMetadata.js
useEffect(() => {
  const doc = metadataQuery.data?.document;
  if (!doc) return;

  const loadedSourcefile = doc.sourcefile ?? "";
  originalSourcefileRef.current = loadedSourcefile;  // ← snapshot of Azure Search value
  setFormData({ sourcefile: loadedSourcefile, ... });
}, [metadataQuery.data]);
```

---

### Step 2 — The Rename Fires in Parallel (Non-Fatal)

If `sourcefileChanged` is true, the rename is pushed into `Promise.all` alongside the Azure Search update:

```javascript
// frontend/src/.../hooks/useFileQueueEditMetadata.js
if (sourcefileChanged) {
  updates.push(
    fileQueueDocumentActionsService
      .renameFile(file.id, newSourcefile)  // ← file.id is the UUID of the EDMSFileProcessing row
      .catch((err) => {
        console.error(
          "[FileQueueEditMetadataModal] DB rename failed (non-fatal):",
          err,
        );
        // error is swallowed — rename failure does not block the Azure Search update
      }),
  );
}

await Promise.all(updates);
```

The `.catch` ensures a DB failure never rejects `Promise.all`. The Azure Search update completes regardless.

---

### Step 3 — The Frontend Service Fires the HTTP Request

```javascript
// frontend/src/.../services/fileQueueDocumentActionsService.js
async renameFile(fileRecordId, newFileName) {
  const { data } = await api.patch(`/file-queue/files/${fileRecordId}/rename`, {
    file_name: newFileName,   // ← the new display name
  });
  return data;
},
```

**What goes over the wire:**
```
PATCH /api/file-queue/files/abc-uuid-123/rename
Content-Type: application/json

{ "file_name": "new_report_v2.pdf" }
```

- `fileRecordId` (`file.id`) — the UUID of the `doc_intel_files_processing` row, from the URL path.
- `file_name` — the new display name from the form.

---

### Step 4 — The Request Schema: Validation and Whitespace Stripping

**File:** `backend/app/schemas/edms_file_processing.py`

```python
class RenameFileRequest(BaseModel):
    file_name: str = Field(
        ...,
        min_length=1,     # ← empty string is rejected before the route runs
        max_length=500,
        description="New display name for the file.",
    )

    @field_validator("file_name", mode="before")
    @classmethod
    def strip_and_validate(cls, v: str) -> str:
        if isinstance(v, str):
            v = v.strip()   # ← "  name.pdf  " becomes "name.pdf" automatically
        return v
```

Pydantic runs `strip_and_validate` **before** `min_length` is checked (`mode="before"`). So `"  "` (all spaces) strips to `""`, which then fails `min_length=1` with a `422 Unprocessable Entity` — the route never runs.

---

### Step 5 — The FastAPI Route: A Thin Delegation Wrapper

**File:** `backend/app/routes/file_queue.py`

```python
@router.patch("/files/{file_record_id}/rename", response_model=RenameFileResponse)
async def rename_file(
    file_record_id: str,               # ← from URL path
    body: RenameFileRequest,           # ← from JSON body (already stripped/validated)
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),  # ← auth guard (401 if missing)
):
    try:
        service = FileQueueService(db)
        previous_name, new_name = await service.rename_file(file_record_id, body.file_name)

        logger.info(
            f"User {current_user.id} renamed file record {file_record_id}: "
            f"'{previous_name}' -> '{new_name}'"
        )

        return RenameFileResponse(
            success=True,
            message="File renamed successfully",
            file_record_id=file_record_id,
            previous_name=previous_name,
            file_name=new_name,
        )
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))   # ← service raises Python-native error
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error renaming file {file_record_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
```

The route does **zero DB work**. The three `except` blocks handle distinct cases:

| Exception | Source | HTTP Result |
|---|---|---|
| `FileNotFoundError` | Service raises when row not found | `404` |
| `HTTPException` | FastAPI internals (e.g., 422 from Pydantic) | Pass-through |
| `Exception` | Any unexpected DB/network error | `500` |

---

### Step 6 — The Service: The Actual DB Work

**File:** `backend/app/services/file_queue_service.py`

```python
async def rename_file(
    self, file_record_id: str, new_file_name: str
) -> tuple[Optional[str], str]:
```

**Phase A — Query the row:**
```python
result = await self.db.execute(
    select(EDMSFileProcessing).where(EDMSFileProcessing.id == file_record_id)
)
file_record = result.scalar_one_or_none()
```

Queries `doc_intel_files_processing` for the row where `id = file_record_id`.

**Phase B — Guard if not found:**
```python
if not file_record:
    raise FileNotFoundError(f"File record {file_record_id} not found")
```

Raises Python's built-in `FileNotFoundError` — **not** `HTTPException`. The service has no knowledge of HTTP. The route translates this into a 404.

**Phase C — Mutate and commit:**
```python
previous_name = file_record.file_name   # ← capture before overwriting
file_record.file_name = new_file_name   # ← SQLAlchemy tracks this as a dirty field
await self.db.commit()                  # ← issues UPDATE doc_intel_files_processing SET file_name = '...' WHERE id = '...'
```

SQLAlchemy tracks the in-memory mutation. `commit()` flushes it as a SQL `UPDATE` — no explicit SQL string needed.

**Phase D — Return the audit tuple:**
```python
return previous_name, new_file_name
# e.g. ("old_report.pdf", "new_report_v2.pdf")
```

The route uses `previous_name` to populate the response so the frontend knows what changed.

---

### Step 7 — The Response Schema

**File:** `backend/app/schemas/edms_file_processing.py`

```python
class RenameFileResponse(BaseModel):
    success: bool               # always True on the happy path
    message: str                # "File renamed successfully"
    file_record_id: str         # the UUID from the URL, echoed back
    previous_name: Optional[str]  # what the file_name WAS (for UI feedback / undo)
    file_name: str              # what the file_name IS now
```

Example response:
```json
{
  "success": true,
  "message": "File renamed successfully",
  "file_record_id": "abc-uuid-123",
  "previous_name": "old_report.pdf",
  "file_name": "new_report_v2.pdf"
}
```

`previous_name` is the most useful audit field — it lets the UI show what changed and could support an undo operation.

---

## Complete Data Flow

```
User edits "sourcefile" field in FileQueueEditMetadataModal
        │
        ▼
handleSubmit() in useFileQueueEditMetadata.js
  newSourcefile = formData.sourcefile.trim()
  sourcefileChanged = (newSourcefile !== originalSourcefileRef.current) && Boolean(file?.id)
        │
        ▼  (if sourcefileChanged is true)
fileQueueDocumentActionsService.renameFile(file.id, newSourcefile)
  → PATCH /api/file-queue/files/{file.id}/rename
       Body: { "file_name": "new_report_v2.pdf" }
        │
        ▼  Pydantic: RenameFileRequest
        │  @field_validator strips whitespace
        │  min_length=1 guard (422 if blank after strip)
        │  body.file_name = "new_report_v2.pdf"
        │
        ▼  FastAPI route: rename_file()
        │  file_record_id = "abc-uuid-123"  ← from URL
        │  body.file_name = "new_report_v2.pdf"  ← from body
        │  current_user validated (401 if missing)
        │  → FileQueueService(db).rename_file(file_record_id, body.file_name)
        │
        ▼  FileQueueService.rename_file("abc-uuid-123", "new_report_v2.pdf")
        │  SELECT * FROM doc_intel_files_processing WHERE id = 'abc-uuid-123'
        │  Not found? → raise FileNotFoundError → route maps to 404
        │  previous_name = "old_report.pdf"
        │  file_record.file_name = "new_report_v2.pdf"
        │  db.commit()
        │    → UPDATE doc_intel_files_processing
        │         SET file_name = 'new_report_v2.pdf'
        │         WHERE id = 'abc-uuid-123'
        │  return ("old_report.pdf", "new_report_v2.pdf")
        │
        ▼  Route builds RenameFileResponse
        │
        ▼  200 OK
{
  "success": true,
  "message": "File renamed successfully",
  "file_record_id": "abc-uuid-123",
  "previous_name": "old_report.pdf",
  "file_name": "new_report_v2.pdf"
}
        │
        ▼  (non-fatal: .catch() swallows any error)
Promise.all continues → onSaved() → modal closes
```

---

## API Surface

| Method | Endpoint | Purpose |
|---|---|---|
| `PATCH` | `/api/file-queue/files/{fileRecordId}/rename` | Rename `file_name` in SQL table |

---

## Key Design Decisions (From Code)

1. **Display-name only** — The rename touches only the `file_name` column in `doc_intel_files_processing`. The blob URL, SharePoint path, and Azure Search `sourcefile` field are separate concerns.
2. **Non-fatal in the frontend** — `renameFile` is wrapped in `.catch()` inside `Promise.all`. A DB failure cannot block the Azure Search metadata update.
3. **`FileNotFoundError` not `HTTPException`** — The service raises a Python-native error. HTTP knowledge is the route's concern, not the service's. This follows the same separation used by `reset_file_for_retry`.
4. **`previous_name` in the response** — Captured before the mutation and returned so the UI can display a diff without re-fetching.
5. **`mode="before"` on the validator** — Whitespace stripping runs before Pydantic's `min_length` check. `"  "` → `""` → `422`, not `200`.
6. **No `db.rollback()` needed** — The service doesn't catch exceptions, so if `commit()` fails, SQLAlchemy's session lifecycle handles cleanup. The route's `except Exception` catches the error without needing an explicit rollback.

---

## Referenced Files

- `backend/app/routes/file_queue.py`
- `backend/app/services/file_queue_service.py`
- `backend/app/schemas/edms_file_processing.py`
- `backend/app/models/edms_file_processing.py`
- `frontend/src/pages/SharePointManagement/File_Queue/hooks/useFileQueueEditMetadata.js`
- `frontend/src/pages/SharePointManagement/File_Queue/services/fileQueueDocumentActionsService.js`
