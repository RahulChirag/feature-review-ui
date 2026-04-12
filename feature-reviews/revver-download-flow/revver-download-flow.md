# Feature Explanation: Revver Document Download Flow

> **Generated from actual code analysis. No assumptions made.**
> **Date:** 2026-04-12

---

## What is this feature?

The Revver download flow is the per-file pipeline that pulls binary file content from the Revver (eFileCabinet) REST API into the indexing worker so the file can be chunked, embedded, and pushed into Azure AI Search. It is invoked once per claimed file inside `FileProcessingWorkerService.process_batch()` and routes through a cached Revver fetcher that must hold a valid OAuth access token, request a short-lived OneTimeToken, and finally issue an HTTP GET against `/api/FileDownload/{fileId}/{oneTimeToken}`. This flow is currently producing ~60% HTTP 401 failures in production, and the code path has several structural properties that make 401 responses on the final GET effectively unrecoverable within a single download attempt.

---

## Where does this happen in the code?

| File | Responsibility |
|------|----------------|
| `backend/app/services/document_fetchers/revver_document_fetcher.py` | Revver OAuth handshake, token cache, OneTimeToken acquisition, and final `/api/FileDownload` GET |
| `backend/app/services/file_processing_worker_service.py` | Per-batch orchestrator: owns `_fetcher_cache`, calls `fetcher.download_file(file_id)` for each Revver file |
| `backend/app/scheduler/file_worker_dag_manager.py` | APScheduler job `file_worker_job` that instantiates `FileProcessingWorkerService` fresh on every firing and runs N workers in parallel |
| `backend/app/config/settings.py` | Defines `concurrent_index_job_qty` (default 3) -- number of parallel worker jobs |
| `backend/app/config/settings.pdmiprod.json` | PDMI prod override: `concurrent_index_job_qty = 4` |
| `backend/app/config/settings.sklsiprod.json` | SKLSI prod override: `concurrent_index_job_qty = 10` |

---

## Step-by-Step Execution Flow

### Step 1: Token Acquisition & Caching
- **File:** `backend/app/services/document_fetchers/revver_document_fetcher.py`
- **Function:** `_authenticate()` (line 352) -> `_authenticate_inner()` (line 371) -> `_get_access_token()` (line 287)
- **What happens:** `_authenticate()` takes the class-level `_auth_lock` (line 366) and early-returns if an access token already exists and the cached `_token_expiration` is still in the future. Otherwise it calls `_authenticate_inner()`, which does a three-step handshake: POST `/Token` with `grant_type=password` to get an access token (line 323), GET `/api/Authentication?accessToken=...` to list accounts (line 386), then POST `/api/Authentication` with the selected account body (line 426). Expiration is computed locally from `expires_in` (line 343).
- **Code snippet:**
```python
# revver_document_fetcher.py:366-369
async with self._auth_lock:
    if self._access_token and self._token_expiration and datetime.now(timezone.utc) < self._token_expiration:
        return
    await self._authenticate_inner()
```
```python
# revver_document_fetcher.py:342-343
expires_in = int(token_data.get("expires_in", 3600))
self._token_expiration = datetime.now(timezone.utc) + timedelta(seconds=expires_in)
```

### Step 2: OneTimeToken Request
- **File:** `backend/app/services/document_fetchers/revver_document_fetcher.py`
- **Function:** `_get_one_time_token()` (line 1850)
- **What happens:** Issues `POST /api/OneTimeToken` via `_make_request_with_retry("POST", url, json={}, raw_response=True)` (line 1857). Because this call goes through the retry wrapper, a 401 response here will trigger the wrapper's one-shot re-auth branch (see Step 4). The token body is decoded from bytes, stripped of surrounding quotes, and returned as a plain string. An empty decoded result raises `ValueError`.
- **Code snippet:**
```python
# revver_document_fetcher.py:1856-1863
url = f"{self.base_url}/api/OneTimeToken"
result = await self._make_request_with_retry("POST", url, json={}, raw_response=True)
if result is None or len(result) == 0:
    raise ValueError("[Revver] OneTimeToken returned empty response")
text = result.decode("utf-8").strip().strip('"')
if not text:
    raise ValueError("[Revver] OneTimeToken response empty after decode")
return text
```

### Step 3: FileDownload Request (bypasses retry wrapper)
- **File:** `backend/app/services/document_fetchers/revver_document_fetcher.py`
- **Function:** `download_file()` (line 1865)
- **What happens:** After acquiring the OneTimeToken, `download_file()` constructs both a path-style URL (`/api/FileDownload/{file_id}/{token}`) and a query-style URL. It then opens a **raw `httpx.AsyncClient`** directly (line 1911) and issues `client.get(url_path, headers=headers)`. This call does **not** go through `_make_request` or `_make_request_with_retry`. The `Authorization: Bearer <access_token>` header is set from `self._access_token` (line 1909) -- the OneTimeToken lives in the URL, not the header. If the response is `404`, the code falls back to the query-style URL (line 1913), but **no other status code triggers any retry**. A 401 response reaches `response.raise_for_status()` at line 1924 and propagates straight out of `download_file()`.
- **Code snippet:**
```python
# revver_document_fetcher.py:1906-1924
url_path = f"{self.base_url}/api/FileDownload/{file_id}/{token}"
url_query = f"{self.base_url}/api/FileDownload?id={file_id}&accessToken={token}"

headers = {"Authorization": f"Bearer {self._access_token}"}

async with httpx.AsyncClient(timeout=120.0) as client:
    response = await client.get(url_path, headers=headers)
    if response.status_code == 404 and url_path != url_query:
        logger.debug(
            "[Revver] FileDownload path-style returned 404, trying query params"
        )
        response = await client.get(url_query, headers=headers)

if response.status_code >= 400:
    logger.error(
        "[Revver] FileDownload file_id=%s -> %d  body: %s",
        file_id, response.status_code, (response.text or "")[:500],
    )
    response.raise_for_status()
```
Note also the pre-download token guard at lines 1882-1885: it checks only the **local** `_token_expiration` clock; it does not verify with Revver whether the token is still accepted server-side.
```python
# revver_document_fetcher.py:1882-1885
if self._access_token is None:
    await self._authenticate()
elif self._token_expiration and datetime.now(timezone.utc) >= self._token_expiration:
    await self._refresh_access_token()
```

### Step 4: Retry & Error Handling on 401
- **File:** `backend/app/services/document_fetchers/revver_document_fetcher.py`
- **Function:** `_make_request_with_retry()` (line 599)
- **What happens:** When a caller (e.g. `_get_one_time_token`, `_get_node_permissions`, metadata GETs) receives an `HTTPStatusError` with `status == 401`, the wrapper clears `self._access_token` and `self._token_expiration`, sets `auth_retried = True`, and loops once more -- which causes `_make_request` to hit the `if self._access_token is None` branch at line 551 and re-authenticate before retrying the original request. This is the ONLY place in the fetcher where a 401 automatically triggers re-auth and retry.
- **Code snippet:**
```python
# revver_document_fetcher.py:627-639
except httpx.HTTPStatusError as exc:
    last_exc = exc
    status = exc.response.status_code

    if status == 401 and not auth_retried:
        logger.warning(
            "[Revver] %s %s returned 401 (token expired?), re-authenticating and retrying once",
            method, url,
        )
        self._access_token = None
        self._token_expiration = None
        auth_retried = True
        continue
```
**Critical consequence:** Because `download_file()` at line 1912 calls `httpx.AsyncClient.get()` directly instead of going through `_make_request_with_retry`, a 401 on `GET /api/FileDownload/...` is **never** caught by this branch. The 401 is logged at line 1920, `raise_for_status()` is called at line 1924, and the exception flows up into `_download_file` in the worker.

### Step 5: Worker Architecture & Token Lifecycle
- **File:** `backend/app/services/file_processing_worker_service.py`
- **Functions:** `__init__` (line 471), `_download_file()` (line 1251), `process_batch()` (line 3039)
- **File:** `backend/app/scheduler/file_worker_dag_manager.py`
- **Functions:** `file_worker_job()` (line 39), `sync_worker_jobs()` (line 282)
- **What happens:**
  1. `sync_worker_jobs` reads `settings.concurrent_index_job_qty` (line 304) and registers that many APScheduler interval jobs whose callable is `file_worker_job` (lines 397, 411).
  2. Every time APScheduler fires a worker job, `file_worker_job` constructs a **brand-new** `FileProcessingWorkerService(db, worker_id)` (line 66) and calls `worker.process_batch(batch_size)` (line 67). The service instance -- and therefore its `_fetcher_cache` -- does not survive between firings.
  3. Inside `process_batch`, the very first action (line 3061) is `self._fetcher_cache.clear()`. This happens on every batch.
  4. `_download_file` looks up a per-site fetcher in `self._fetcher_cache` keyed by `site.id` (line 1262). On a cache miss it builds a new fetcher via `EDMSDocumentService._get_fetcher(site, self.db)` (line 1265) and stores it (line 1266). For Revver, it calls `fetcher.download_file(file_id)` (line 1303).
- **Code snippet:**
```python
# file_worker_dag_manager.py:64-67
async with async_session() as db:
    try:
        worker = FileProcessingWorkerService(db, worker_id)
        stats = await worker.process_batch(batch_size)
```
```python
# file_processing_worker_service.py:3061
self._fetcher_cache.clear()
```
```python
# file_processing_worker_service.py:1262-1266
cache_key = str(site.id)
fetcher = self._fetcher_cache.get(cache_key)
if fetcher is None:
    fetcher = await EDMSDocumentService._get_fetcher(site, self.db)
    self._fetcher_cache[cache_key] = fetcher
```
```python
# file_processing_worker_service.py:1297-1303
if site.site_type == SiteType.REVVER.value:
    if not file_id:
        logger.error(
            f"[Worker {self.worker_id}] Missing file_id for Revver download"
        )
        return None
    content = await fetcher.download_file(file_id)
```
- **Production worker counts (from settings):**
```json
// settings.pdmiprod.json:124
"concurrent_index_job_qty": 4,
```
```json
// settings.sklsiprod.json:125
"concurrent_index_job_qty": 10,
```

---

## What is the code ACTUALLY doing?

### Normal Path (No Failures)

1. APScheduler fires `file_worker_job` for, say, `worker-2` (`file_worker_dag_manager.py:39`).
2. A fresh `FileProcessingWorkerService` is instantiated with an empty `_fetcher_cache` (`file_processing_worker_service.py:471`) and `process_batch` runs (`file_worker_dag_manager.py:67`).
3. `process_batch` clears `_fetcher_cache` (line 3061) and claims a batch of files.
4. For the first Revver file, `_download_file` finds no cached fetcher, calls `EDMSDocumentService._get_fetcher` (line 1265), and stores the new fetcher. This fetcher has `_access_token = None` and `_token_expiration = None` at creation time.
5. The worker calls `fetcher.download_file(file_id)` (line 1303).
6. Inside `download_file`, the pre-download guard at lines 1882-1885 sees `_access_token is None` and calls `_authenticate()`, which takes `_auth_lock`, runs `_authenticate_inner`, and populates `_access_token` plus `_token_expiration` (`revver_document_fetcher.py:339-343`).
7. `download_file` calls `_get_one_time_token()` (line 1889), which POSTs `/api/OneTimeToken` through `_make_request_with_retry` and returns a short-lived token string (line 1863).
8. `download_file` issues `GET /api/FileDownload/{fileId}/{oneTimeToken}` via a raw `httpx.AsyncClient` with `Authorization: Bearer <access_token>` (lines 1906-1912). Revver streams bytes back. `response.content` is returned to `_download_file` (line 1303), which returns it up the call chain (line 857).
9. For subsequent files in the same batch, the cached fetcher is reused; the token guard (lines 1882-1885) short-circuits because `_access_token` is populated and the local clock says the token is not expired.

### Failure Path (401 on FileDownload)

1. Steps 1-7 of the normal path succeed. `_get_one_time_token` returns successfully (its 401 protection via `_make_request_with_retry` worked).
2. `GET /api/FileDownload/{fileId}/{oneTimeToken}` at `revver_document_fetcher.py:1912` returns HTTP 401.
3. Because `url_path == url_query` is false (they differ) and the status is not 404, the 404 fallback branch at line 1913 is not taken.
4. The `if response.status_code >= 400` branch at line 1919 fires. `logger.error("[Revver] FileDownload file_id=%s -> %d  body: %s", ...)` writes one error line (line 1920).
5. `response.raise_for_status()` at line 1924 throws `httpx.HTTPStatusError`.
6. Because this code is NOT inside `_make_request_with_retry`, the 401-recovery branch at lines 631-639 is never reached. `self._access_token` and `self._token_expiration` are **not** cleared.
7. The exception propagates to `_download_file` in the worker (line 1303), which catches it at line 1325. `_download_file` returns `None` after populating `_last_error`, and the caller at line 857 records a `DOWNLOAD failed` error (line 865).
8. On the **next** Revver file in the same batch, the cached fetcher is returned from `_fetcher_cache` (line 1263). Its `_access_token` is still the old one. `download_file` runs again: the guard at lines 1882-1885 still sees the token as locally valid (non-None, not past `_token_expiration`), so it does NOT re-authenticate. `_get_one_time_token` is called; if Revver considers the access token invalid, this POST returns 401 -- and that call IS wrapped in `_make_request_with_retry`, so the wrapper at lines 631-639 clears the token, re-authenticates, and retries the OneTimeToken POST once. The new OneTimeToken then feeds into another raw `FileDownload` GET -- which may again return 401 and again bypass all retry logic.
9. No logger line in this file announces "recovering" or "re-downloading" after a 401 on `/api/FileDownload` -- the only log messages emitted on that path are the error at line 1920 (`[Revver] FileDownload file_id=... -> ...`) and, if the request later succeeds, the debug at line 1927 (`[Revver] FileDownload file_id=... -> ... size=...`). There is no intermediate 401-recovery log for the FileDownload GET specifically.

---

## Important Notes

### Key Findings Summary

| # | Finding | Impact | Location |
|---|---------|--------|----------|
| 1 | `download_file` issues `GET /api/FileDownload/...` via a raw `httpx.AsyncClient.get()` instead of `_make_request_with_retry`, so a 401 on the download URL never triggers the re-auth-and-retry branch | A single 401 permanently fails that file for this attempt; `_access_token` is not invalidated | `revver_document_fetcher.py:1911-1912` |
| 2 | The only special-case retry in `download_file` is for HTTP 404 (falls back from path-style to query-style URL). 401, 403, 429, 5xx are all delivered straight to `raise_for_status()` | No server-driven recovery for any status except 404 | `revver_document_fetcher.py:1913-1924` |
| 3 | `_make_request_with_retry` clears `_access_token` and retries once on 401 -- this logic exists but only protects callers that use it (e.g. `_get_one_time_token`, `_get_node_permissions`) | OneTimeToken POST self-heals on 401; FileDownload GET does not | `revver_document_fetcher.py:631-639` |
| 4 | The pre-download token check looks at a local clock (`_token_expiration`) only. It does not probe Revver; a server-side revocation is invisible to this check | Cached fetchers can keep presenting a stale Bearer token until `_token_expiration` passes | `revver_document_fetcher.py:1882-1885` |
| 5 | The `Authorization: Bearer <access_token>` header is still sent on the FileDownload GET even though the OneTimeToken is already embedded in the URL; if Revver rejects the Bearer, the request 401s regardless of the URL token | 401 on download is tied to access-token validity, not just OneTimeToken validity | `revver_document_fetcher.py:1909` |
| 6 | `process_batch` clears `_fetcher_cache` at the start of every batch (line 3061) and `file_worker_job` instantiates a brand-new `FileProcessingWorkerService` on every APScheduler firing (line 66), so fetcher identity lasts only for the duration of one batch | Auth handshake cost is paid per batch per site, and token state is re-established cleanly per batch, but a 401 mid-batch is not healed for the rest of that batch | `file_processing_worker_service.py:3061`, `file_worker_dag_manager.py:66` |
| 7 | Concurrent worker instances share no fetcher state (each `FileProcessingWorkerService` owns its own `_fetcher_cache`), so N workers hitting the same Revver site perform N independent OAuth handshakes | PDMI prod runs 4 parallel workers; SKLSI prod runs 10 -- each can independently trigger OAuth against the same Revver account | `file_processing_worker_service.py:471`, `settings.pdmiprod.json:124`, `settings.sklsiprod.json:125` |
| 8 | `_auth_lock` is `ClassVar[asyncio.Lock]` (line 98), which serialises authentication only within a single Python process and only for fetchers in the same event loop. Concurrent APScheduler firings inside one process will serialise, but cross-process or cross-replica races are not covered | Does not address 401s caused by concurrent OAuth handshakes at the Revver side if multiple processes/replicas are running | `revver_document_fetcher.py:98` |

### What the Code Does NOT Encode

- **There is no 401-specific recovery inside `download_file`.** The only status-specific branch is the 404 fallback at `revver_document_fetcher.py:1913`. The `raise_for_status()` call at line 1924 treats 401 identically to 500.
- **There is no retry of the entire two-step download.** After a failed FileDownload GET, the code does not re-fetch a fresh OneTimeToken and try again. Control leaves `download_file` on the first failed GET attempt after the optional 404 fallback.
- **There is no health-check call that validates `_access_token` with Revver before reuse.** The only validity signal is the local `_token_expiration` comparison at line 1884.
- **There is no backoff / jitter on authentication.** `_authenticate_inner()` runs unconditionally once the lock is held (line 369); there is no sleep, no circuit breaker, and no delay between failed auth attempts.
- **There is no process-wide or distributed singleton token cache.** `_secret_cache` at line 95 is a class-level dict but it stores Key Vault **secrets**, not the issued access token. `_access_token` is an instance attribute populated inside `_get_access_token` at line 339 and is therefore per-fetcher-instance.
- **There is no per-site rate limiting for OAuth handshakes.** Each fresh fetcher instance performs a full `_get_access_token` (line 287) -> `_authenticate_inner` (line 371) handshake on first request. With 4 (PDMI) or 10 (SKLSI) concurrent workers plus per-batch cache clearing at line 3061, the Revver `/Token` endpoint is called at least once per worker per batch per site that has files in that batch.

---

## Explain Like I'm 10 Years Old

Imagine you want to pick up packages from a big warehouse. The warehouse gives you two things at the front desk: a wristband (access token) and, each time you want a package, a paper ticket (OneTimeToken).

Our code walks up to the desk, gets the wristband, then asks for a paper ticket for one package. When it goes to the package window and shows both, usually it gets the package. But sometimes the window guard says "your wristband is no good" (HTTP 401).

For **asking for the paper ticket**, our code has a rule: "if the guard says your wristband is no good, throw it away, get a new wristband, and ask again." That part works.

For **picking up the package**, our code has NO such rule. It just drops the package on the floor and walks away sad. It does not throw away the wristband, and it does not try again with a new one. The next package it tries to pick up, it walks back to the window with the SAME bad wristband and a brand-new paper ticket, and sometimes the guard says "nope" all over again.

And because we have 4 (or 10) helpers all doing this at the same time, each with their own wristband, when the warehouse is cranky about wristbands, they all fail together.

---

## Summary

- Entry point: `file_processing_worker_service.py` -> `_download_file()` (line 1251) -> `revver_document_fetcher.py` -> `download_file()` (line 1865)
- Key files involved:
  - `backend/app/services/document_fetchers/revver_document_fetcher.py` (OAuth, OneTimeToken, FileDownload GET)
  - `backend/app/services/file_processing_worker_service.py` (per-batch orchestrator and fetcher cache)
  - `backend/app/scheduler/file_worker_dag_manager.py` (APScheduler job wiring)
  - `backend/app/config/settings.py` / `settings.pdmiprod.json` / `settings.sklsiprod.json` (worker count)
- APIs called:
  - Revver API `POST /Token` (OAuth ROPC + refresh_token grant)
  - Revver API `GET /api/Authentication?accessToken=...` (list accounts)
  - Revver API `POST /api/Authentication` (select account)
  - Revver API `POST /api/OneTimeToken` (short-lived download token)
  - Revver API `GET /api/FileDownload/{fileId}/{oneTimeToken}` (path-style download)
  - Revver API `GET /api/FileDownload?id={fileId}&accessToken={oneTimeToken}` (query-style fallback on 404)
- Database operations: None performed by `download_file` itself. The broader download step writes error state into `EDMSFileProcessing` through `_download_file` error handling, but that is outside the Revver HTTP flow.
- Feature complexity: **High**
- Primary findings driving the 401 failure rate:
  1. `download_file` bypasses `_make_request_with_retry`, so a 401 on the `/api/FileDownload` GET is never auto-recovered and never invalidates the cached access token (`revver_document_fetcher.py:1911-1924`).
  2. The pre-download token check trusts a local expiration clock and never validates the access token with Revver before reuse (`revver_document_fetcher.py:1882-1885`).
  3. Per-batch `_fetcher_cache.clear()` plus per-firing `FileProcessingWorkerService` instantiation means every batch forces a fresh OAuth handshake per Revver site, and PDMI prod runs 4 of those batches in parallel (SKLSI prod runs 10), each holding an independent access token (`file_processing_worker_service.py:3061`, `file_worker_dag_manager.py:66`, `settings.pdmiprod.json:124`, `settings.sklsiprod.json:125`).
  4. The FileDownload GET still sends `Authorization: Bearer <access_token>`, so its success is coupled to access-token validity even though the OneTimeToken is in the URL (`revver_document_fetcher.py:1909`).
