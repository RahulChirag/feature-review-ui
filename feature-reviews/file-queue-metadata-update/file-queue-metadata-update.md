# Feature Explanation: File Queue — Document Metadata Update

> Generated from actual code analysis. No assumptions made.
> Date: 2026-06-03

---

## What is this feature?

**Document Metadata Update** lets an admin edit classification fields (category, docType, sensitivityLabel, status, docOwner, department, region, businessUnit, retentionPolicy, language, tags, sourcefile) for any indexed document directly from the File Queue UI. The change is persisted to **Azure AI Search**, not to the SQL database. Every chunk of the document is patched in a single batched operation using the Azure Search SDK's `merge` action.

The operation is initiated from `FileQueueEditMetadataModal` on the frontend, travels through a TanStack mutation, hits `documentMetadataService`, then a FastAPI `PATCH` route, and finally `SearchMetadataManager.update_document_metadata` which queries Azure Search for all chunk IDs and issues a bulk merge.

---

## Architecture and Key Components

### System Map

| Layer | File | Responsibility |
|---|---|---|
| UI Modal | `frontend/src/.../FileQueueEditMetadataModal.jsx` | Renders form, calls `onSubmitMetadata` |
| Hook | `frontend/src/.../useFileQueueEditMetadata.js` | Manages form state, fires parallel updates |
| Actions Service | `frontend/src/.../fileQueueDocumentActionsService.js` | Single integration point; delegates to documentMetadataService |
| Frontend Service | `frontend/src/services/documentMetadataService.js` | Issues `PATCH` HTTP request via Axios |
| Backend Route | `backend/app/routes/document_metadata.py` | FastAPI endpoint; validates, delegates to manager |
| Backend Service | `backend/app/services/search_metadata_manager.py` | Queries Azure Search for chunk IDs; batch merges |
| Schema | `backend/app/schemas/document_metadata.py` | `DocumentMetadataUpdateRequest` / `DocumentMetadataUpdateResponse` |

---

## Where Does This Happen in the Code?

| File | Responsibility |
|---|---|
| `frontend/src/pages/SharePointManagement/File_Queue/components/FileQueueEditMetadataModal.jsx` | UI entry point — modal that holds the form |
| `frontend/src/pages/SharePointManagement/File_Queue/hooks/useFileQueueEditMetadata.js` | `handleSubmit` — orchestrates parallel Azure Search + DB rename |
| `frontend/src/pages/SharePointManagement/File_Queue/services/fileQueueDocumentActionsService.js` | `updateDocumentMetadata` — delegates to documentMetadataService |
| `frontend/src/services/documentMetadataService.js` | `updateDocumentMetadata` — issues `PATCH /document-metadata/documents/{parentDocumentId}` |
| `backend/app/routes/document_metadata.py` | `update_document_metadata` route — validates, calls SearchMetadataManager |
| `backend/app/services/search_metadata_manager.py` | `update_document_metadata` method — batch merges all chunks in Azure Search |
| `backend/app/schemas/document_metadata.py` | `DocumentMetadataUpdateRequest`, `DocumentMetadataUpdateResponse` |

---

## Step-by-Step Execution Flow

### Step 1 — User Opens the Edit Modal

The modal is rendered by `FileQueueEditMetadataModal.jsx`. On open, `useFileQueueEditMetadata` fires a `useQuery` to load current metadata from Azure Search:

```javascript
// frontend/src/.../hooks/useFileQueueEditMetadata.js
const metadataQuery = useQuery({
  queryKey: ["fq-edit-document-metadata", parentDocumentId],
  queryFn: () => fileQueueDocumentActionsService.getDocumentMetadata(parentDocumentId),
  enabled: open && Boolean(parentDocumentId),
});
```

The loaded data populates `formData`:

```javascript
// frontend/src/.../hooks/useFileQueueEditMetadata.js
useEffect(() => {
  const doc = metadataQuery.data?.document;
  if (!doc) return;

  const loadedSourcefile = doc.sourcefile ?? "";
  originalSourcefileRef.current = loadedSourcefile;  // ← stored for rename diff check later

  setFormData({
    sourcefile: loadedSourcefile,
    category: doc.category ?? "",
    docType: doc.docType ?? "",
    sensitivityLabel: doc.sensitivityLabel ?? "",
    status: doc.status ?? "",
    docOwner: doc.docOwner ?? "",
    department: doc.department ?? "",
    region: doc.region ?? "",
    businessUnit: doc.businessUnit ?? "",
    retentionPolicy: doc.retentionPolicy ?? "",
    language: doc.language ?? "",
  });
  setTags(doc.tags ?? []);
}, [metadataQuery.data]);
```

---

### Step 2 — User Saves: `handleSubmit` in the Hook

When the user clicks Save, `handleSubmit` runs:

```javascript
// frontend/src/.../hooks/useFileQueueEditMetadata.js
const payload = omitBlankValues({
  ...formData,
  tags: tags.length ? tags : null,
});
```

`omitBlankValues` strips any field that is `""`, `null`, or `undefined`:

```javascript
function omitBlankValues(payload) {
  return Object.fromEntries(
    Object.entries(payload).filter(
      ([, v]) => v !== "" && v !== null && v !== undefined,
    ),
  );
}
```

Then **two parallel updates** fire via `Promise.all`:

```javascript
// frontend/src/.../hooks/useFileQueueEditMetadata.js
const updates = [];

// 1. Azure Search metadata patch (always)
updates.push(
  new Promise((resolve, reject) => {
    onSubmitMetadata?.(
      { parentDocumentId, payload },
      { onSuccess: resolve, onError: reject },
    );
    if (!onSubmitMetadata) resolve();
  }),
);

// 2. SQL DB rename (only if sourcefile changed)
if (sourcefileChanged) {
  updates.push(
    fileQueueDocumentActionsService
      .renameFile(file.id, newSourcefile)
      .catch((err) => {
        console.error("[FileQueueEditMetadataModal] DB rename failed (non-fatal):", err);
      }),
  );
}

await Promise.all(updates);
```

The DB rename is **non-fatal**: if it fails the catch swallows the error and the Azure Search update still completes.

---

### Step 3 — Frontend Service Fires the HTTP Request

`onSubmitMetadata` is a TanStack mutation callback wired to `fileQueueDocumentActionsService.updateDocumentMetadata`:

```javascript
// frontend/src/.../services/fileQueueDocumentActionsService.js
updateDocumentMetadata(parentDocumentId, payload) {
  return documentMetadataService.updateDocumentMetadata(
    requireParentDocumentId(parentDocumentId),
    payload,
  );
},
```

Which calls `documentMetadataService`:

```javascript
// frontend/src/services/documentMetadataService.js
updateDocumentMetadata: async (parentDocumentId, metadata) => {
  const response = await api.patch(
    `/document-metadata/documents/${parentDocumentId}`,
    metadata,
  );
  return response.data;
},
```

**What goes over the wire:**
```
PATCH /api/document-metadata/documents/{parentDocumentId}
Content-Type: application/json

{
  "sourcefile": "new_name.pdf",
  "category": "HR",
  "sensitivityLabel": "confidential"
}
```

Only non-blank fields are included. `parentDocumentId` is in the URL path.

---

### Step 4 — The FastAPI Route

**File:** `backend/app/routes/document_metadata.py`

```python
@router.patch(
    "/documents/{parent_document_id}",
    response_model=DocumentMetadataUpdateResponse,
)
async def update_document_metadata(
    parent_document_id: str,                          # ← from URL path
    updates: DocumentMetadataUpdateRequest,            # ← from JSON body
    current_user: User = Depends(get_current_user),   # ← auth guard
    manager: SearchMetadataManager = Depends(get_search_metadata_manager),  # ← Azure client
):
```

**What the route does:**

**1. Extract non-null fields only:**
```python
field_updates = updates.get_non_null_updates()
# Example result: {"sourcefile": "new_name.pdf", "category": "HR", "sensitivityLabel": "confidential"}
```

**2. Guard against empty payload:**
```python
if not field_updates:
    raise HTTPException(status_code=400, detail="No fields provided for update")
```

**3. Delegate to the service:**
```python
result = await manager.update_document_metadata(
    parent_document_id=parent_document_id,
    updates=updates,
)
```

**4. Map 404 if document not found:**
```python
if not result.success and result.chunks_updated == 0:
    if "No chunks found" in result.message:
        raise HTTPException(
            status_code=404,
            detail=f"Document with parentDocumentId '{parent_document_id}' not found"
        )
```

---

### Step 5 — The Schema: What Fields Are Accepted

**File:** `backend/app/schemas/document_metadata.py`

```python
class DocumentMetadataUpdateRequest(BaseModel):
    sourcefile: Optional[str] = Field(None, ...)  # display filename
    category: Optional[str] = Field(None, ...)
    docType: Optional[str] = Field(None, ...)
    sensitivityLabel: Optional[str] = Field(None, ...)
    status: Optional[str] = Field(None, ...)
    docOwner: Optional[str] = Field(None, ...)
    department: Optional[str] = Field(None, ...)
    region: Optional[str] = Field(None, ...)
    businessUnit: Optional[str] = Field(None, ...)
    retentionPolicy: Optional[str] = Field(None, ...)
    language: Optional[str] = Field(None, ...)
    tags: Optional[List[str]] = Field(None, ...)   # replaces existing tags entirely

    def get_non_null_updates(self) -> Dict[str, any]:
        """Returns only the fields that were explicitly set (not None)."""
        return {k: v for k, v in self.model_dump().items() if v is not None}
```

All 12 fields are `Optional`. `get_non_null_updates()` is the filter that prevents accidentally overwriting existing values with `None`.

---

### Step 6 — SearchMetadataManager: The Azure Search Update

**File:** `backend/app/services/search_metadata_manager.py` — `update_document_metadata` method

**Phase A — Extract fields again:**
```python
metadata_updates = updates.get_non_null_updates()
# {"sourcefile": "new_name.pdf", "category": "HR", "sensitivityLabel": "confidential"}
```

**Phase B — Build the Azure Search OData filter:**
```python
escaped_id = parent_document_id.replace("'", "''")
filter_query = f"parentDocumentId eq '{escaped_id}'"
```

This targets **every chunk** of the document in Azure AI Search. One PDF may have 10, 50, or 200 chunks.

**Phase C — Paginated chunk fetch (IDs only, up to 1000 per request):**
```python
result = await search_client.search(
    search_text="",
    filter=filter_query,
    top=BATCH_SIZE,      # 1000 — Azure Search max per request
    skip=skip,
    select=["id"],       # ← Only fetch chunk IDs, nothing else
)
```

**Phase D — Build merge documents:**
```python
async for doc in result:
    update_doc = {
        "id": doc["id"],              # ← required by Azure to identify which chunk
        "@search.action": "merge",    # ← only overwrites fields you provide
    }
    update_doc.update(metadata_updates)
    documents_to_update.append(update_doc)
```

A single entry looks like:
```json
{
  "id": "abc123_chunk_001",
  "@search.action": "merge",
  "sourcefile": "new_name.pdf",
  "category": "HR",
  "sensitivityLabel": "confidential"
}
```

**`@search.action: "merge"` is critical** — it tells Azure to only overwrite the specified fields and leave `content`, `storageUrl`, `chunkIndex`, etc. completely untouched.

**Phase E — Submit the batch:**
```python
await search_client.merge_or_upload_documents(documents_to_update)
total_updated += len(documents_to_update)
```

The while loop repeats with `skip += 1000` until fewer than 1000 chunks are returned.

---

### Step 7 — The Response Schema

**File:** `backend/app/schemas/document_metadata.py`

```python
class DocumentMetadataUpdateResponse(BaseModel):
    success: bool           # True / False
    parent_document_id: str # Which document was updated
    chunks_updated: int     # How many Azure Search chunks were patched
    fields_updated: List[str]  # Names of the fields that were changed
    message: str            # Human-readable summary
```

Example response:
```json
{
  "success": true,
  "parent_document_id": "a1b2c3d4e5f6g7h8",
  "chunks_updated": 14,
  "fields_updated": ["sourcefile", "category", "sensitivityLabel"],
  "message": "Successfully updated 14 chunks"
}
```

---

## Complete Data Flow

```
User edits form in FileQueueEditMetadataModal
        │
        ▼
handleSubmit() in useFileQueueEditMetadata.js
  omitBlankValues({...formData, tags}) → payload (only non-empty fields)
        │
        ├─── Promise 1: onSubmitMetadata({ parentDocumentId, payload })
        │         │
        │         ▼  fileQueueDocumentActionsService.updateDocumentMetadata()
        │         │  → documentMetadataService.updateDocumentMetadata()
        │         │  → PATCH /api/document-metadata/documents/{parentDocumentId}
        │         │        Body: { "sourcefile": "new.pdf", "category": "HR" }
        │         │
        │         ▼  FastAPI route: update_document_metadata()
        │         │  1. Deserialize body → DocumentMetadataUpdateRequest
        │         │  2. get_non_null_updates() → {"sourcefile": "new.pdf", "category": "HR"}
        │         │  3. Guard: reject if empty (400)
        │         │  4. Delegate to SearchMetadataManager.update_document_metadata()
        │         │
        │         ▼  SearchMetadataManager.update_document_metadata()
        │         │  1. Build filter: parentDocumentId eq 'a1b2c3d4e5f6g7h8'
        │         │  2. Paginated search: select=["id"], top=1000
        │         │  3. Build merge docs: {id, @search.action:merge, ...fields}
        │         │  4. merge_or_upload_documents(batch) → Azure patches only those fields
        │         │  5. Repeat until < 1000 chunks returned
        │         │
        │         ▼  Response: {success:true, chunks_updated:14, fields_updated:[...]}
        │
        └─── Promise 2 (if sourcefile changed): renameFile(file.id, newSourcefile)
                  → PATCH /api/file-queue/files/{fileRecordId}/rename
                  → Updates file_name in SQL doc_intel_files_processing table
                  (non-fatal: failure is caught and swallowed)

await Promise.all([...])
→ onSaved?.() → onOpenChange(false)
```

---

## API Surface

| Method | Endpoint | Purpose |
|---|---|---|
| `PATCH` | `/api/document-metadata/documents/{parentDocumentId}` | Update fields on all Azure Search chunks |
| `GET` | `/api/document-metadata/documents/{parentDocumentId}` | Load current metadata for the modal |
| `PATCH` | `/api/file-queue/files/{fileRecordId}/rename` | Update `file_name` in SQL (parallel, non-fatal) |

---

## Key Design Decisions (From Code)

1. **Azure Search is the source of truth for metadata** — not the SQL DB. The SQL `EDMSFileProcessing` row only stores `file_name` for display purposes.
2. **All chunks are updated** — a single PDF = many chunks in Azure Search. The manager loops until every chunk is patched.
3. **`@search.action: "merge"`** — only provided fields are overwritten. Content, embeddings, chunk data are untouched.
4. **Parallel dual-update** — `Promise.all` fires Azure Search + SQL rename at the same time for performance. DB rename failure is caught so it cannot block the Azure update.
5. **Null-stripping at two levels** — `omitBlankValues` on frontend (removes `""`) + `get_non_null_updates()` on backend (removes `None`) ensure no accidental overwrites.

---

## Referenced Files

- `backend/app/routes/document_metadata.py`
- `backend/app/services/search_metadata_manager.py`
- `backend/app/schemas/document_metadata.py`
- `frontend/src/services/documentMetadataService.js`
- `frontend/src/pages/SharePointManagement/File_Queue/hooks/useFileQueueEditMetadata.js`
- `frontend/src/pages/SharePointManagement/File_Queue/services/fileQueueDocumentActionsService.js`
- `frontend/src/pages/SharePointManagement/File_Queue/components/FileQueueEditMetadataModal.jsx`
