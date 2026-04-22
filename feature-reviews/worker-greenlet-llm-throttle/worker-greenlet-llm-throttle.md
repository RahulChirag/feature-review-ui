# Feature Explanation: Worker Greenlet Fix and LLM Enrichment Throttle

> **Generated from actual code analysis. No assumptions made.**
> **Date:** 2026-04-22

---

## What is this feature?

This change makes the background file processing worker more reliable in two ways. First, it stops a class of crashes that happened when the worker held onto the same database connection for too long while processing a batch of files. Second, it puts a "traffic light" in front of the AI enrichment calls so the system does not flood the AI provider with too many requests at once, and it retries politely when the AI provider says it is busy. Together, these changes keep large batches of files moving through the pipeline without dropping work on the floor.

---

## Where does this happen in the code?

| File | Responsibility |
|------|----------------|
| `backend/app/config/database_sqlalchemy.py` | Creates the async database engine and the session factory used across the app. |
| `backend/app/services/file_processing_worker_service.py` | The worker that claims a batch of files and processes each one. Now opens a fresh session per file. |
| `backend/app/services/business_context_enrichment_service.py` | Calls the AI model to enrich each document. Now protected by a concurrency gate and a retry loop. |
| `backend/app/config/settings.py` | Defines the tunable settings (`enrichment_max_concurrency`, `enrichment_max_retries`). |
| `backend/app/config/settings.sklsiprod.json` | Environment config for the SKLSI production worker; tuned to match PDMI's proven values. |
| `backend/tests/test_async_session_factory.py` | Verifies the session factory is the modern async type with the right flags. |
| `backend/tests/test_process_batch_fresh_session.py` | Verifies each file in a batch runs on its own session and `self.db` is restored afterward. |
| `backend/tests/test_enrichment_throttle.py` | Verifies retries on 429/connection errors and that the concurrency cap is enforced. |

---

## Step-by-Step Execution Flow

### Step 1: The app builds a modern async session factory at startup

- **File:** `backend/app/config/database_sqlalchemy.py`
- **Function:** module-level factory creation
- **What happens:** In plain terms, this is the "connection dispenser" the rest of the app uses. The change swaps it from the older style to the modern async-native style, and turns off two behaviors (`autoflush`, `expire_on_commit`) that used to cause hidden database calls to happen at awkward moments.
- **Code snippet:**

```python
# backend/app/config/database_sqlalchemy.py:82-86
async_session_factory = async_sessionmaker(
    bind=engine,
    expire_on_commit=False,
    autoflush=False,
)
```

Connections are also checked before use and recycled periodically so stale ones are not handed out:

```python
# backend/app/config/database_sqlalchemy.py:70-80
engine = create_async_engine(
    settings.async_database_url,
    future=True,
    echo=False,  # set True to debug SQL
    pool_size=settings.db_pool_size,
    max_overflow=settings.db_pool_max_overflow,
    pool_timeout=settings.db_pool_timeout_seconds,
    pool_recycle=settings.db_pool_recycle_seconds,
    pool_pre_ping=True,  # verify connections are alive before using them
    connect_args={**CONNECT_ARGS, "connect_timeout": 10},  # 10s TCP connect timeout
)
```

### Step 2: The worker claims a batch and processes each file on its own fresh session

- **File:** `backend/app/services/file_processing_worker_service.py`
- **Function:** `process_batch()`
- **What happens:** Instead of one long-held database connection for the whole batch (which Azure MySQL could silently cut off after an idle window), the worker now opens a brand new short-lived session for each file, temporarily points `self.db` at it, and restores the previous one when the file finishes.
- **Code snippet:**

```python
# backend/app/services/file_processing_worker_service.py:68
from app.config.database_sqlalchemy import async_session as get_fresh_session
```

```python
# backend/app/services/file_processing_worker_service.py:3219-3256
                async with get_fresh_session() as db:
                    prior_db = self.db
                    self.db = db
                    file_record = None
                    try:
                        file_record = await db.get(EDMSFileProcessing, file_id)
                        if file_record is None:
                            logger.info(
                                f"[Worker {self.worker_id}] File {file_id} not found when re-fetching in per-file session, skipping"
                            )
                            stats["skipped"] += 1
                            file_detail["status"] = "skipped"
                            processed_files.append(file_detail)
                            continue

                        if (
                            file_record.processing_status
                            != FileProcessingStatus.PROCESSING.value
                        ):
                            ...
                            continue

                        # Process the file
                        result = await self.process_file(file_record)

                        # Update status based on result
                        await self.complete_file(file_record, result)
```

The "restore `self.db`" safety net lives in the `finally` block:

```python
# backend/app/services/file_processing_worker_service.py:3318-3319
                    finally:
                        self.db = prior_db
```

### Step 3: Enrichment requests go through a concurrency gate

- **File:** `backend/app/services/business_context_enrichment_service.py`
- **Function:** `_get_enrichment_semaphore()` + the `async with _get_enrichment_semaphore()` block around the LLM call
- **What happens:** Only a limited number of AI calls are allowed to be in flight at the same time, process-wide. If 16 files all finish parsing at once, only 4 of them are calling the AI at any given moment; the other 12 politely wait in line.
- **Code snippet:**

```python
# backend/app/services/business_context_enrichment_service.py:56-64
_enrichment_sem: Optional[asyncio.Semaphore] = None


def _get_enrichment_semaphore() -> asyncio.Semaphore:
    """Return the process-wide enrichment semaphore."""
    global _enrichment_sem
    if _enrichment_sem is None:
        _enrichment_sem = asyncio.Semaphore(settings.enrichment_max_concurrency)
    return _enrichment_sem
```

```python
# backend/app/services/business_context_enrichment_service.py:453-462
        async with _get_enrichment_semaphore():
            llm_out = await _call_llm_with_retry(
                messages,
                {
                    "max_tokens": settings.enrichment_max_tokens,
                    "temperature": 0,
                    "response_format": unified_fmt,
                },
            )
```

### Step 4: If the AI says "too busy," the code retries with backoff

- **File:** `backend/app/services/business_context_enrichment_service.py`
- **Function:** `_call_llm_with_retry()`
- **What happens:** When the AI provider returns a 429 "rate limited," or a timeout, or a connection blip, the code waits a random-but-growing amount of time and tries again, up to `enrichment_max_retries` attempts. It only retries those three specific failure types — everything else fails fast so real bugs are not masked.
- **Code snippet:**

```python
# backend/app/services/business_context_enrichment_service.py:67-83
async def _call_llm_with_retry(
    messages: List[Dict[str, str]],
    context_overrides: Dict[str, Any],
) -> Dict[str, Any]:
    """Run chat completion with retry for transient provider failures."""
    async for attempt in AsyncRetrying(
        retry=retry_if_exception_type((RateLimitError, APITimeoutError, APIConnectionError)),
        wait=wait_random_exponential(multiplier=2, min=2, max=60),
        stop=stop_after_attempt(settings.enrichment_max_retries),
        before_sleep=before_sleep_log(logger, logging.WARNING),
        reraise=True,
    ):
        with attempt:
            return await run_chat_completion(messages, context_overrides=context_overrides)

    # Unreachable due to reraise=True; explicit for type-checker safety.
    raise RuntimeError("enrichment retry loop terminated unexpectedly")
```

### Step 5: If all retries fail, the file keeps moving

- **File:** `backend/app/services/business_context_enrichment_service.py`
- **Function:** `_run_unified_enrichment()` (exception branch)
- **What happens:** Enrichment is "best-effort." If the AI call finally gives up, the error is recorded on the result object and returned — the whole file processing job is not crashed.
- **Code snippet:**

```python
# backend/app/services/business_context_enrichment_service.py:474-477
    except Exception as exc:
        logger.warning("Enrichment unified LLM call failed: %s", exc)
        result.error = f"llm_unified: {exc}"
        return result
```

### Step 6: The tunables live in settings with safe defaults

- **File:** `backend/app/config/settings.py`
- **Function:** `Settings` class attributes
- **What happens:** Two knobs are exposed so each environment can dial them up or down without code changes.
- **Code snippet:**

```python
# backend/app/config/settings.py:142-143
    enrichment_max_concurrency: int = 4
    enrichment_max_retries: int = 5
```

### Step 7: SKLSI worker timing was aligned with PDMI's tuned values

- **File:** `backend/app/config/settings.sklsiprod.json`
- **What happens:** The interval, batch size, lock window, and stale-lock rescue were brought in line with the already-proven PDMI config so the scheduler stops spamming "max instances reached" warnings and the stale-lock rescue does not yank files mid-processing.
- **Code snippet:**

```json
// backend/app/config/settings.sklsiprod.json:155-162
  "file_processor_interval_seconds": 60,
  "file_processor_max_instances": 2,
  "concurrent_index_job_qty": 5,
  "indexing_batch_size": 5,
  "file_lock_timeout_seconds": 180,
  "file_max_retries": 1,
  "file_retry_backoff_base_seconds": 60,
  "stale_lock_rescue_interval_seconds": 180,
```

---

## What is the code ACTUALLY doing?

- `database_sqlalchemy.py` constructs a single `async_sessionmaker` (`async_session_factory`) with `expire_on_commit=False` and `autoflush=False`. The wrapper `async_session()` (an `asynccontextmanager`) is exported and imported into the worker as `get_fresh_session`.
- In `file_processing_worker_service.py::process_batch`, after `claim_batch` returns a list of `EDMSFileProcessing` rows, the code pre-loads a `site_cache` using `self.db`, then enters a per-file loop. Each iteration opens `async with get_fresh_session() as db`, swaps `self.db` for the new session, re-fetches the row via `db.get(EDMSFileProcessing, file_id)`, checks `processing_status`, then calls `self.process_file(...)` and `self.complete_file(...)`. A `finally` block restores `self.db = prior_db`.
- In `business_context_enrichment_service.py`, `_get_enrichment_semaphore()` lazily builds a module-level `asyncio.Semaphore(settings.enrichment_max_concurrency)`. The semaphore is acquired with `async with _get_enrichment_semaphore():` immediately before calling `_call_llm_with_retry(...)`.
- `_call_llm_with_retry` uses `tenacity.AsyncRetrying` with `retry_if_exception_type((RateLimitError, APITimeoutError, APIConnectionError))`, `wait_random_exponential(multiplier=2, min=2, max=60)`, and `stop_after_attempt(settings.enrichment_max_retries)`. `reraise=True` means the original exception is re-raised after exhaustion.
- The caller `_run_unified_enrichment` wraps the semaphore + retry block in `try/except Exception`, logs a warning, sets `result.error = f"llm_unified: {exc}"`, and returns the partial `result` so the pipeline continues.
- Tests in `test_enrichment_throttle.py` exercise three scenarios: retry-then-succeed on `APIConnectionError`, retry-then-succeed on a 429 `RateLimitError` built from a real `httpx.Response`, and retry-exhaustion where `mock_call.await_count == 5` and `result.error` contains `"llm_unified"`. A fourth test fires 16 concurrent enrichments and asserts `max_in_flight == 4`.

---

## Important Notes

- The `enrichment_max_retries` setting is consumed directly by `stop_after_attempt(settings.enrichment_max_retries)` at call-build time, so changing it at runtime requires a process restart (the retry controller is built per call, but the semaphore is not rebuilt if concurrency changes).
- The semaphore is lazily initialized once per process and stored in module global `_enrichment_sem`. Tests reset it in an autouse fixture.
- `process_batch` still uses `self.db` to pre-load the site cache before the per-file loop; only the per-file body runs on a fresh session.
- The retry policy only catches `RateLimitError`, `APITimeoutError`, and `APIConnectionError`. Other exceptions (e.g., schema/parse errors) are not retried.
- If enrichment ultimately fails, the file processing flow is NOT aborted — the error is recorded on `result.error` and the pipeline continues.
- `settings.local.json` is modified on this branch but does not add the enrichment keys; the defaults in `settings.py` apply unless an environment JSON overrides them.

---

## Explain Like I'm 10 Years Old

Imagine a kitchen that takes food orders (files) and has to ask a very busy chef (the AI) to describe each dish before serving it.

Old way: one waiter walked into the kitchen holding a single notepad for the whole shift. After a while the notepad got soggy and fell apart mid-shift. Also, when a big rush hit, ten waiters all yelled at the chef at the same time, the chef got overwhelmed and said "I am too busy," and the waiters just threw the orders in the trash.

New way: each order gets its own fresh notepad that gets thrown out at the end (fresh database session per file). And there is a rope line outside the kitchen that only lets four waiters in at a time (the semaphore). If the chef does say "too busy," the waiter steps outside, counts to a few seconds, and politely tries again up to five times. If the chef really cannot help, the waiter writes "chef unavailable" on the ticket and the meal still goes out — just without the fancy description.

---

## Summary

- Entry point: `backend/app/services/file_processing_worker_service.py` → `process_batch()` (called by the APScheduler tick)
- Key files involved:
  - `backend/app/config/database_sqlalchemy.py`
  - `backend/app/services/file_processing_worker_service.py`
  - `backend/app/services/business_context_enrichment_service.py`
  - `backend/app/config/settings.py`
  - `backend/app/config/settings.sklsiprod.json`
- APIs called: Azure OpenAI chat completion via `app.services.llm_chat_service.run_chat_completion` (invoked inside `_call_llm_with_retry`)
- Database operations:
  - `db.get(EDMSFileProcessing, file_id)` per file inside `process_batch`
  - `self.claim_batch(batch_size)` (via `get_fresh_session` claim_db at line 755) and `_record_processing_stats` (fresh session at line 3076) in `file_processing_worker_service.py`
- Feature complexity: Medium
