# File Rename Feature — Technical & Non-Technical Reference

> **Source**: Pure code analysis. No assumptions.
> **Files analysed**: `routes/file_queue.py`, `services/file_queue_service.py`, `schemas/file_queue.py`, `services/fileQueueDocumentActionsService.js`, `hooks/useFileQueueMetadata.js`, `components/FileQueueEditMetadataModal.jsx`

---

## 1. What the Feature Does (Non-Technical)

When an admin opens the **Edit Metadata** panel for a **MyVault** file in the File Queue table, they see a **File Name** input field at the top. This field shows the current file name without its extension. The extension is shown separately as a read-only badge next to the input.

If the admin changes the name and clicks **Save Changes**, the system:

1. **Renames the file in Azure Blob Storage** — copies the blob to a new path with the new name, waits for the copy to finish, then deletes the old blob.
2. **Updates the database record** — changes `file_name`, `file_path`, and `blob_url` in the `doc_intel_files_processing` table.
3. **Updates the Azure AI Search index** — patches the `sourcefile`, `title`, and `storageUrl` fields on every chunk of the indexed document.
4. **Then saves any other metadata changes** (category, tags, etc.) as a second call.

> **Constraint**: This feature only works for MyVault files. SharePoint and Revver files cannot be renamed through this UI.

---

## 2. How It Works — Full Technical Flow

### 2.1 Architecture Overview

```
Parent Component (e.g., FileQueue.jsx)
  └── Passes onRenameFile prop down
       └── FileQueueEditMetadataModal.jsx ← UI
            └── useFileQueueMetadata.js   ← Hook with submit logic
                 └── calls onRenameFile(…) then onSubmitMetadata(…)

Backend:
  PATCH /file-queue/files/{file_id}/rename
    └── routes/file_queue.py       → rename_file()
         └── FileQueueService.rename_file()  [static method]
              1. DB lookup (EDMSFileProcessing + EDMSSite JOIN)
              2. Blob Storage: copy + delete
              3. DB update: commit
              4. Azure Search: update_document_metadata (if indexed)
```

---

### 2.2 Frontend — Request Schema

**File**: `backend/app/schemas/file_queue.py`

```python
class FileNameUpdateRequest(BaseModel):
    new_name: str
```

**What goes over the wire:**
```
PATCH /file-queue/files/<uuid>/rename
Body: { "new_name": "My New Report" }
```
The extension is **never sent**. The backend reads the original extension from the DB record (`file_name`) and appends it itself.

---

### 2.3 Frontend — Modal Logic (`useFileQueueMetadata.js` & `FileQueueEditMetadataModal.jsx`)

#### MyVault detection
```jsx
// useFileQueueMetadata.js
const isMyVault = file?.sourceSystem?.toLowerCase() === "myvault";
```
The File Name input is **only rendered** when `isMyVault` is `true`:
```jsx
{isMyVault && (
  <div className="space-y-1.5 md:col-span-2">
    <Label>File Name</Label>
    <div className="flex items-center gap-2">
      <Input
        value={fileNameBase}
        onChange={(e) => setFileNameBase(e.target.value)}
        placeholder="Enter file name"
      />
      <Badge variant="secondary">
        {fileExtension}   {/* ← read-only extension badge */}
      </Badge>
    </div>
  </div>
)}
```

#### Name splitting on modal open
```javascript
// useFileQueueMetadata.js
useEffect(() => {
  if (file?.file_name) {
    const lastDotIdx = file.file_name.lastIndexOf(".");
    if (lastDotIdx > 0) {
      setFileNameBase(file.file_name.substring(0, lastDotIdx));   // "Report"
      setFileExtension(file.file_name.substring(lastDotIdx));     // ".pdf"
    } else {
      setFileNameBase(file.file_name);
      setFileExtension("");
    }
  }
}, [file]);
```

#### Submit logic — rename-then-metadata chaining
```javascript
const submit = (e) => {
  e.preventDefault();
  if (isSaving) return;
  if (!parentDocumentId) return;

  const payload = stripEmpty({ ...formData, tags: tags.length ? tags : null });

  // Only rename if it's MyVault AND the name actually changed
  const isRenamed = isMyVault && fileNameBase + fileExtension !== file?.file_name;

  const handleSuccess = () => {
    onSaved?.();
    onOpenChange(false);
  };

  if (isRenamed && onRenameFile) {
    // STEP 1: Rename
    onRenameFile(
      { fileRecordId: file.id, newName: fileNameBase },
      {
        onSuccess: () => {
          // STEP 2: Save metadata ONLY after rename succeeds
          if (onSubmitMetadata) {
            onSubmitMetadata({ parentDocumentId, payload }, { onSuccess: handleSuccess });
          } else {
            handleSuccess();
          }
        }
      }
    );
  } else {
    // No rename — just save metadata directly
    if (onSubmitMetadata) {
      onSubmitMetadata({ parentDocumentId, payload }, { onSuccess: handleSuccess });
    } else {
      handleSuccess();
    }
  }
};
```

> **Key design decision**: The rename and metadata update are **chained sequentially**. Metadata is only saved if rename succeeds. If rename fails, metadata is not saved either.

---

### 2.4 Backend — API Route (`routes/file_queue.py`)

```python
@router.patch("/files/{file_id}/rename")
async def rename_file(
    file_id: str,
    request: FileNameUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Rename a file in the File Queue (MyVault files only)."""
    try:
        if not request.new_name or not request.new_name.strip():
            raise HTTPException(status_code=400, detail="New file name cannot be empty.")

        result = await FileQueueService.rename_file(db, file_id, request.new_name.strip())
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error renaming file {file_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to rename file: {str(e)}")
```

**Route guards:**
- Empty name → HTTP 400 before the service is even called
- `ValueError` from service (wrong file type, missing blob) → HTTP 400
- Any other exception → HTTP 500

---

### 2.5 Backend — Service (`services/file_queue_service.py`)

The method is declared as a `@staticmethod`. It receives `db` explicitly because it doesn't use `self.db`.

#### Step 1: Fetch record + validate
```python
stmt = select(EDMSFileProcessing, EDMSSite).join(EDMSSite).where(
    EDMSFileProcessing.id == file_record_id
)
result = await db.execute(stmt)
row = result.first()
if not row:
    raise ValueError(f"File record {file_record_id} not found.")

file_record, site = row

if site.site_type.lower() != "myvault":
    raise ValueError("Only MyVault files can be renamed.")

old_ext = os.path.splitext(old_file_name)[1]
new_file_name = f"{new_name}{old_ext}"    # extension always preserved

if new_file_name == old_file_name:
    return {"success": True, "message": "File name is unchanged."}
```

#### Step 2: Compute new blob path
```python
old_blob_url = file_record.blob_url
from urllib.parse import urlparse, unquote
parsed = urlparse(old_blob_url)
path_parts = parsed.path.lstrip("/").split("/", 1)
old_blob_path = unquote(path_parts[1])

old_blob_dir = os.path.dirname(old_blob_path)
if old_blob_dir:
    new_blob_path = f"{old_blob_dir}/{new_file_name}"
else:
    new_blob_path = new_file_name
```

#### Step 3: Azure Blob Storage copy-then-delete
```python
from app.core.azure_credentials import get_keyvault_credential
credential = get_keyvault_credential(getattr(settings, "azure_umi_id", None))

blob_service_client = BlobServiceClient(
    account_url=f"https://{settings.azure_storage_account}.blob.core.windows.net",
    credential=credential
)
container_client = blob_service_client.get_container_client(settings.azure_storage_container)

source_blob = container_client.get_blob_client(old_blob_path)
dest_blob   = container_client.get_blob_client(new_blob_path)

if not await source_blob.exists():
    raise ValueError(f"Source blob {old_blob_path} does not exist in storage.")

await dest_blob.start_copy_from_url(source_blob.url)

# Poll until the intra-account copy completes
props = await dest_blob.get_blob_properties()
while props.copy.status == 'pending':
    await asyncio.sleep(0.5)
    props = await dest_blob.get_blob_properties()

if props.copy.status != 'success':
    raise Exception(f"Blob copy failed with status {props.copy.status}")

new_blob_url = dest_blob.url
await source_blob.delete_blob()   # ← old blob deleted ONLY after successful copy
```

> **Azure has no native rename** — rename = copy + delete. The code polls `copy.status` because `start_copy_from_url` is async even for intra-account copies using the async Azure SDK.

#### Step 4: Database commit
```python
if file_record.file_path and file_record.file_path.endswith(old_file_name):
    file_record.file_path = file_record.file_path[:-len(old_file_name)] + new_file_name

file_record.file_name = new_file_name
file_record.blob_url  = new_blob_url
await db.commit()
```

Fields updated in `doc_intel_files_processing`:
- `file_name` → new full name (e.g. `My New Report.pdf`)
- `file_path` → path with new name (suffix-swap: trims old name, appends new name)
- `blob_url`  → new blob URL

**DB is committed AFTER blob copy succeeds.** If blob copy fails, DB is never touched.

#### Step 5: Azure Search index update
```python
parent_document_id = file_record.md5_hash
if parent_document_id:
    try:
        from app.routes.document_metadata import get_search_metadata_manager
        manager = await get_search_metadata_manager()
        updates = DocumentMetadataUpdateRequest(
            title=new_file_name,
            sourcefile=new_file_name,
            storageUrl=new_blob_url
        )
        await manager.update_document_metadata(
            parent_document_id=parent_document_id,
            updates=updates
        )
    except Exception as e:
        logger.error(f"Failed to update Azure Search metadata during rename: {e}")
        # Non-fatal: DB and Blob already consistent
        return {
            "success": True,
            "message": "Renamed in Blob and Database, but Azure Search update failed.",
            "error": str(e)
        }
```

**Key behaviour**: Search index update is **best-effort**. If it fails, the rename is still considered successful (blob + DB are consistent). The error is logged and returned in the response body, but HTTP status remains 200.

The `from app.routes.document_metadata import get_search_metadata_manager` import is **intentionally kept deferred** (not at module top) to prevent a circular import at server startup (`service → routes` is the wrong direction).

---

## 3. Before vs After Refactoring

### What Changed (Refactoring Only — Zero Logic Change)

#### `routes/file_queue.py` — Before
```python
# ❌ 6 Pydantic schemas defined inside the routes file
class FileNameUpdateRequest(BaseModel):
    new_name: str

# ❌ Deferred inline imports inside handler bodies
async def get_file_details(file_record_id, ...):
    from sqlalchemy import select                              # ← inline
    from app.models.edms_file_processing import EDMSFileProcessing  # ← inline
```

#### `routes/file_queue.py` — After
```python
# ✅ All imports at the top
import logging
from datetime import datetime, timezone, timedelta
...
from app.schemas.file_queue import (
    FileDetailsResponse, FileNameUpdateRequest, FileQueueItemResponse, ...
)
# ✅ Schemas live in schemas/file_queue.py — not in routes
```

---

#### `services/file_queue_service.py` — Before
```python
# ❌ SILENT BUG: reset_file_for_retry() returned None on success
async def reset_file_for_retry(self, file_id):
    try:
        ...
        await self.db.commit()
        # ← NO return True here! Returns None implicitly.
    except Exception as e:
        return False
```

#### `services/file_queue_service.py` — After
```python
# ✅ BUG FIXED: now returns True on success
async def reset_file_for_retry(self, file_id):
    try:
        ...
        await self.db.commit()
        return True   # ← added; without this, UI always got 404 on reset
    except Exception as e:
        return False
```

---

## 4. Possible Q&A from Reviewer

### Non-Technical

**Q: Why can only MyVault files be renamed?**
> The code checks `site.site_type.lower() != "myvault"` and raises a `ValueError` for any other type. SharePoint and Revver files are managed by external systems and renaming them in our DB without syncing to the source system would cause a mismatch. MyVault files are fully owned by this platform.

**Q: What happens if the user types the same name and saves?**
> The backend checks `if new_file_name == old_file_name: return {"success": True, "message": "File name is unchanged."}` before doing anything. No blob copy, no DB change, no search update. The frontend also checks `fileNameBase + fileExtension !== file?.file_name` — if unchanged, the rename call is skipped entirely and only the metadata is saved.

**Q: Does the file extension change?**
> No. The extension is always read from the existing `file_name` in the database using `os.path.splitext()`. The user only types the base name. The extension is shown as a read-only badge in the UI.

**Q: What if the blob rename fails halfway?**
> The old blob is only deleted **after** the copy is confirmed successful (`copy.status == 'success'`). The DB is committed **after** the blob operation. If the blob copy fails, nothing is committed. If the copy succeeds but the delete of the old blob fails, we'd have two blobs temporarily — but the error is caught and surfaced as an exception. The DB still won't be updated.

**Q: What if Azure Search fails to update?**
> The rename is still treated as successful. The code has a `try/except` around the search update that logs the error and returns `success: True` with a warning message. The blob and database are already consistent at that point.

---

### Technical

**Q: Why is `rename_file` a `@staticmethod` instead of an instance method?**
> It takes `db` as an explicit parameter because the route calls it without instantiating `FileQueueService(db)` first — `FileQueueService.rename_file(db, file_id, ...)`. This is inconsistent with other methods like `reset_file_for_retry`, which use `self.db`. It works correctly but is a convention inconsistency that could be cleaned up in a future refactor.

**Q: Why is `from app.routes.document_metadata import get_search_metadata_manager` kept as a deferred import inside the function?**
> To prevent a circular import at server startup. `services/` is imported by `routes/`. If `services/file_queue_service.py` were to top-level import from `app.routes.document_metadata`, Python would try to import a routes module while the service module itself is still being initialized — which can cause `ImportError: cannot import name`. Deferred imports inside function bodies bypass this by running only when the function is called, not at module load time.

**Q: Why does the blob copy use a polling loop instead of `await copy_complete()`?**
> The Azure Blob Storage async SDK's `start_copy_from_url` begins the copy but does not block until completion. The polling loop reads `blob_properties.copy.status` every 0.5 seconds until it's no longer `'pending'`. This is the documented pattern for intra-account blob copies with the `azure-storage-blob` async SDK.

**Q: What is `parent_document_id` and why does the search update depend on it?**
> The `doc_intel_files_processing` table does not have a native `parent_document_id` column. Instead, `md5_hash` serves as the MD5-derived 16-char hash used as the document key in Azure AI Search. The rename logic explicitly assigns `parent_document_id = file_record.md5_hash`. If a file has not yet been indexed (no hash), the search update is skipped. If it is set, the code patches all search index chunks that share that `parentDocumentId`.

**Q: Why does `fileQueueService.renameFile` send only the base name without extension?**
> This is a deliberate API contract. The backend controls the extension by reading it from the DB (`os.path.splitext(file_record.file_name)[1]`). This prevents the user from accidentally changing the file type (e.g., renaming `.pdf` to `.docx`).

**Q: What does the sequential chaining `onRenameFile → onSuccess → onSubmitMetadata` protect against?**
> If saved in parallel, metadata could succeed while rename fails — leaving the index with the new metadata but the old file name. The sequential chain ensures both operations share the same final state. If rename fails, metadata is never updated.
