# SharePoint Site Discovery — Feature Review

> Read-only review. No source files were modified.
> **Date:** 2026-04-13
> **Branch:** `feature/sharepoint-classic-subsite-autodetect`
> **Head commit reviewed:** `f203380 feat: auto-detect Classic vs Modern SharePoint topology on discovery`
> **Reviewer:** codebase-doc-analyzer

---

## 1. Scope & files reviewed

| File | Function | Lines |
|------|----------|-------|
| `backend/app/services/edms_document_service.py` | `_get_sharepoint_access_token` | 50–90 |
| `backend/app/services/edms_document_service.py` | `get_sharepoint_sites_by_domain` | 260–516 |
| `backend/app/services/edms_document_service.py` | `_get_all_subsites` (Graph recursion) | 518–596 |
| `backend/app/services/edms_document_service.py` | `_get_sharepoint_token_for_rest` | 598–638 |
| `backend/app/services/edms_document_service.py` | `_get_all_subsites_rest` (REST fallback) | 640–735 |
| `backend/app/routes/edms_sites.py` | `GET /sharepoint/sites` route handler | 405–473 |
| `backend/app/routes/edms_sites.py` | discovery POST caller | 985–990 |

Token acquisition uses MSAL `ConfidentialClientApplication.acquire_token_for_client` with two different scopes:
- Graph: `https://graph.microsoft.com/.default` — `edms_document_service.py:75`
- SPO REST: `https://{domain}/.default` — `edms_document_service.py:627`

---

## 2. Flow walkthrough

**Entry point.** `GET /edms/sharepoint/sites?domain=…&search=…` (`edms_sites.py:416`) and the bulk discovery endpoint at `edms_sites.py:986` both invoke `EDMSDocumentService.get_sharepoint_sites_by_domain` (`edms_document_service.py:260`).

**Step 1 — Graph token.** `_get_sharepoint_access_token` (`:50`) uses `azure_tenant_id`, `azure_api_client_id`, `azure_api_client_secret` (`:58-60`) to acquire a token with the Graph `.default` scope (`:75`). Missing credentials raise `ValueError`; token acquisition failure raises `RuntimeError`.

**Step 2 — Graph tenant-wide listing (Method 1).** `get_sharepoint_sites_by_domain` pages `GET /v1.0/sites?$select=…` (`:298`) using `@odata.nextLink` until exhausted (`:303-325`). The results are filtered client-side by substring match on `webUrl` against the requested `domain` (`:338-346`). A single `httpx.AsyncClient(timeout=60.0)` is created at `:287`.

**Step 3 — Topology auto-detect per top-level site.** If any sites were found, the code takes a snapshot `top_level_sites = list(all_sites)` (`:358`), then acquires the SPO REST token **once** via `_get_sharepoint_token_for_rest(domain)` (`:359-361`). For each top-level site it calls `_get_all_subsites` over Graph (`:367-370`) and measures how many new rows were appended:

- `_added > 0` → logs `CLASSIC (N subsites via Graph)` (`:372-376`).
- `_added == 0` **and** no REST token → logs `topology unknown (SharePoint REST token not acquired; cannot probe subsites)` and `continue`s (`:382-387`).
- `_added == 0` **and** REST token present → calls `_get_all_subsites_rest(...)` with a `probe_state` dict (`:389-394`) and branches on `_probe_st = _rest_probe.get("subsites_probe_status")` (`:396`):
  - `_added_rest > 0` → `CLASSIC (N subsites via REST fallback)` (`:397-401`).
  - `_probe_st in (401, 403)` → `topology unknown (SharePoint REST denied HTTP …)` with remediation hint (`:402-408`).
  - `_probe_st == 200` → `MODERN (no subsites)` (`:409-413`). **This is the only branch that labels a site MODERN.**
  - else (any other status, including `None` if no response was recorded) → `topology unknown (REST subsite probe HTTP …; not inferring MODERN)` (`:414-418`).
- Any exception from REST fallback → warning + `topology unknown (REST fallback error)` (`:419-427`).

**Step 4 — Graph recursion (`_get_all_subsites`, `:518`).** Calls `GET /v1.0/sites/{site_id}/sites?$select=…` (`:546`), pages via `@odata.nextLink`, dedupes via `seen_site_ids`, and recurses to `max_depth=10` (passed from `:369`; default in signature is `5` at `:526`). HTTP 404 is treated as "no subsites" (`:590`). Any other exception is swallowed with a `warning` (`:593-596`).

**Step 5 — REST recursion (`_get_all_subsites_rest`, `:640`).** Builds `{site_url}/_api/web/webs?$select=Id,Title,Url,Description` (`:674-677`), sets `Accept: application/json;odata=minimalmetadata` (`:680`), issues a single `GET` through a shared `_client` (created at depth 0, reused in recursion — `:669-671`, `:734-735`). On HTTP 429 it honors `Retry-After` and retries once (`:684-688`). At depth 0, it writes `probe_state["subsites_probe_status"] = response.status_code` (`:690-691`). For each returned `web` it synthesizes `{"id": f"rest:{web_url.lower()}", …}` and recurses (`:702-721`). 401/403 are logged as warnings (`:722-726`); 404 is silent; other non-200 statuses log a warning (`:727-730`).

**Step 6 — Fallback methods 2 & 3.** Only executed if `all_sites` is empty after Method 1 (`:432`, `:466`). Method 2 resolves the root site and recurses via Graph; Method 3 tries `$filter=webUrl contains '{domain}'`. Note: **topology auto-detect does not run for sites discovered via Method 2 or Method 3** — the auto-detect block is nested inside the Method 1 `if all_sites:` branch at `:350`.

**Step 7 — Search filter & return.** Name/displayName substring filter applied post-discovery (`:496-508`).

---

## 3. Findings

### F1 — Topology auto-detect only runs when Method 1 finds sites
- **Fact:** The auto-detect loop (`:354-427`) lives inside `if all_sites:` at `:350`, which is itself inside Method 1 (`:297-429`). Method 2 (`:432-463`) and Method 3 (`:466-492`) only run when `not all_sites` and do not re-invoke the probe. As a result, tenants where Method 1 returns zero rows but Method 2/3 succeed will get **no Classic/Modern labeling at all**.
- **Severity:** Correctness / Ops clarity
- **Risk:** Silent mis-coverage of Classic tenants that are discovered through the root-site or `$filter` fallback paths.

### F2 — `_get_all_subsites` default `max_depth` diverges from call sites
- **Fact:** Function signature at `:526` defaults `max_depth=5`. The auto-detect call at `:369` passes `max_depth=10`; the Method 2 call at `:449` uses the default (5). Recursive calls within `_get_all_subsites` at `:580-588` propagate `max_depth`, so the first call wins, but the inconsistency between callers means Method 1 and Method 2 explore to different depths on the same tenant.
- **Severity:** Correctness / Ops clarity
- **Risk:** Method 2 under-discovers subsites beyond depth 5; Method 1 may double the Graph work when tenants don't actually need depth 10.

### F3 — `_get_all_subsites` swallows all non-404 Graph errors as "no subsites"
- **Fact:** At `:549` only HTTP 200 is parsed; `:590` handles 404 explicitly; all other status codes (including 401/403/429/5xx) fall through with **no logging and no exception** — the function simply returns normally. The auto-detect caller then sees `_added == 0` and proceeds to the REST probe (`:377`).
- **Severity:** Correctness / Ops clarity
- **Risk:** A transient Graph 429/5xx on the subsite endpoint is indistinguishable from "no subsites". The site may then be labeled MODERN purely because REST happened to return 200 with empty `value`, even though Graph actually failed. Additionally, exceptions are only caught at `:593-596`; HTTP error status codes never enter that branch because `httpx` does not raise for 4xx/5xx by default.

### F4 — `_added_rest` counts any REST additions, but MODERN inference depends solely on `_probe_st == 200`
- **Fact:** The MODERN branch at `:409-413` fires only when the depth-0 probe returned HTTP 200 *and* the subsite count was zero. This is the intended fix relative to the prior misleading labeling. However, `probe_state` is only written at `current_depth == 0` (`:690-691`), so if `_get_all_subsites_rest` raises before receiving a response (network error, TLS, DNS), `probe_state` stays empty, `_probe_st` is `None`, and the code takes the final `else` branch at `:414-418` with `HTTP None` in the log line. That is technically correct (it does not claim MODERN), but the message is ugly.
- **Severity:** Ops clarity
- **Risk:** Noisy/unparseable log line `REST subsite probe HTTP None`.

### F5 — Per-site REST probe inside an async loop is fully sequential
- **Fact:** The loop at `:362-427` iterates `top_level_sites` with `await` calls to `_get_all_subsites` and `_get_all_subsites_rest` one site at a time. There is no `asyncio.gather`, no semaphore, no batching. Each Graph subsite call is one HTTP round-trip; each REST probe on a "no Graph subsite" site is at least one more HTTP round-trip, and on Classic tenants it recurses depth-first (`:718-721`).
- **Severity:** Performance
- **Risk:** Full-domain discovery wall-clock time is approximately `sum(graph_subsite_rtt + maybe_rest_probe_rtt)` across every top-level site. With hundreds of sites and 100–400 ms per probe, this is minutes. This matches the reported "long runtimes".

### F6 — The `httpx.AsyncClient` timeout is 60s for Graph but 30s for REST; no explicit connect timeout
- **Fact:** Graph client at `:287` uses `timeout=60.0`. REST client at `:671` uses `timeout=30.0`. Neither configures `httpx.Timeout(connect=…, read=…)` separately. On tenants where REST calls hang (e.g. a firewall dropping packets silently), each site burns up to 30 s before advancing.
- **Severity:** Performance / Ops clarity
- **Risk:** One misbehaving site can inflate total runtime by 30 s per probe.

### F7 — REST 429 retry budget is one attempt, with a blocking `asyncio.sleep(retry_after)` inside the critical loop
- **Fact:** `:684-688` honors `Retry-After` once and retries. Because the outer auto-detect loop is sequential (see F5), this sleep blocks discovery of every later site as well. Also, `probe_state` is written *after* the retry (`:690`), so the recorded status reflects the retry's outcome — good — but the sleep is not bounded (`int(response.headers.get("Retry-After", "5"))` — a malicious/misconfigured server could send a very large value).
- **Severity:** Performance / Security (low)
- **Risk:** One throttled site can pause the entire discovery run; unbounded `Retry-After` is a small DoS vector.

### F8 — REST fallback uses `seen_site_ids` shared with Graph, but synthesizes `rest:{url}` ids
- **Fact:** `:702` computes `dedup_key = f"rest:{web_url.lower()}"` and adds it to `seen_site_ids`. Graph-sourced ids are the composite `{hostname},{siteGuid},{webGuid}` form added at `:346`/`:577`. The two id spaces do not collide, so a site present in both Graph and REST results can be **added twice** (once as the Graph composite id, once as `rest:<url>`). The code does not currently cross-check by `webUrl`.
- **Severity:** Correctness
- **Risk:** Duplicates in the discovery response on tenants where a subsite happens to be returned by both paths. In practice the REST fallback only runs when Graph returned 0 subsites for that branch (`:377`), which limits but does not eliminate the overlap — e.g., a child that Graph *does* return at a deeper recursion can still be re-added via REST if the parent's first Graph probe was empty.

### F9 — Graph subsite recursion is called before the REST token has been used, even when REST would fail
- **Fact:** `_spo_rest_token` is acquired once before the loop at `:359`. If the SPO REST app permissions are absent, `acquire_token_for_client` may still return a token successfully (AAD issues the token; the 401 comes from SharePoint when the token is *used*). The code only sees failure at REST call time, not at token-acquisition time. The log message at `:402-408` is therefore the main signal the operator will see when permissions are missing.
- **Severity:** Ops clarity
- **Risk:** Operators reading `_get_sharepoint_token_for_rest` returning a non-None token may assume REST is fully permissioned when in fact only AAD trust is established.

### F10 — Tenant-wide Graph listing uses `/sites` without `search=*`
- **Fact:** `api_url = f"{graph_base_url}/sites?{_site_select}"` at `:298`. Microsoft Graph's `/sites` endpoint without `search=*` returns only the sites *created by the current identity* on some tenant configurations; historically `GET /sites?search=*` was the documented way to enumerate. The current code relies on whatever `/sites` returns, filters client-side (`:333-346`), and **pages over the entire tenant result set** (`:302-325`).
- **Severity:** Correctness / Performance
- **Risk:** Under-discovery on tenants where `/sites` without `search` is restricted; over-fetching + client-side filter on tenants where it returns the full list.

### F11 — Exception flow in auto-detect loop only catches REST-side errors
- **Fact:** The `try`/`except` at `:380-427` wraps only the REST fallback block. If `_get_all_subsites` (the Graph call at `:367-370`) itself raises, the exception propagates out of the auto-detect loop and aborts the entire Method 1 path, caught only by the outer `except Exception as tenant_err` at `:428`. That discards all the work done so far on other sites.
- **Severity:** Correctness / Ops clarity
- **Risk:** A single failing Graph subsite call aborts auto-detect for every site in the domain.

### F12 — Token cache reuse
- **Fact:** `ConfidentialClientApplication` is constructed fresh inside both `_get_sharepoint_access_token` (`:68`) and `_get_sharepoint_token_for_rest` (`:621`). MSAL's in-memory token cache lives on the app instance, so each call re-creates the cache. `acquire_token_for_client` still checks the cache on the new instance (which will be empty), forcing a fresh token endpoint round-trip each invocation.
- **Severity:** Performance
- **Risk:** Extra AAD token endpoint round-trip per discovery run (minor, but adds 100–300 ms per call; noticeable if discovery is invoked repeatedly from the admin UI).

---

## 4. Scenario matrix

| # | Scenario | Current behavior (code) | Current message / label | Correct? |
|---|----------|-------------------------|--------------------------|----------|
| 1 | Graph success — subsites found | `_get_all_subsites` appends rows; `_added > 0` at `:371` | `CLASSIC (N subsites via Graph)` | Yes (label accurately reflects that Classic-style subsites exist; Modern tenants can also have subsites, but calling them CLASSIC is defensible because the discovery behavior is identical) |
| 2 | Graph success — empty subsites | `_added == 0`; proceeds to REST fallback if token present (`:377`) | Depends on REST probe outcome (rows 3–5) | Yes — correctly defers judgement until REST is probed |
| 3 | REST 200 with empty `webs` | `_added_rest == 0`, `_probe_st == 200` (`:690`) | `MODERN (no subsites)` (`:409-413`) | Yes — this is the intended fix in `f203380`; label only asserted on a confirmed 200 |
| 4 | REST 401 / 403 | Warning logged at `:723`; `_probe_st` set to status (`:691`); matches `:402` | `topology unknown (SharePoint REST denied HTTP 401/403; …grant SharePoint application permissions)` | Yes — no longer claims MODERN on a denied probe |
| 5 | REST 5xx / timeout / conn-error | 5xx: `_probe_st` set at `:691`, falls through to `:414-418` → `topology unknown (REST subsite probe HTTP 5xx)`. Timeout / conn-error: exception caught at `:731`, `probe_state` never written, outer `except` at `:419-427` logs `topology unknown (REST fallback error)` | `topology unknown (REST subsite probe HTTP <code>)` **or** `topology unknown (REST fallback error)` | Mostly correct; ops-clarity issue: for 5xx with no exception, if the `_asyncio` retry on 429 cascades into another error, the `probe_state` may reflect either the first or second attempt. Also see F4: if an exception fires *before* the first `await` completes, the final `else` logs `HTTP None`. |
| 6 | Missing token (credentials absent or MSAL failed) | `_get_sharepoint_token_for_rest` returns `None` (`:618`, `:634`); branch at `:382-387` fires | `topology unknown (SharePoint REST token not acquired; cannot probe subsites)` | Yes — explicit and non-misleading |
| 7 | Missing credentials entirely | `_get_sharepoint_access_token` raises `ValueError` at `:62-65` before Graph is even called; caller at `:283` does not catch this inside the try block (the outer `try` at `:282` does, re-raised as `RuntimeError` at `:516`) | Outer route returns HTTP 400 `SHAREPOINT_API_ERROR` | Yes, but note: the value error is re-wrapped as `RuntimeError` via the broad `except Exception as e` at `:514`, so the upstream `SHAREPOINT_API_ERROR` path handles it correctly. |

---

## 5. Performance analysis

**Primary driver — sequential per-site probing (F5).** For each of the N sites returned by the tenant-wide Graph listing, the auto-detect loop executes sequentially:

1. `_get_all_subsites` (at least one `/sites/{id}/sites` call, plus pagination, plus recursion; each RTT is a serialized `await`).
2. Conditional `_get_all_subsites_rest` (one REST call per site whose Graph subsite set was empty, plus recursion on any found).

With `T_graph ≈ 150–300 ms` and `T_rest ≈ 200–500 ms` on a typical tenant, and the REST probe firing for most Modern sites (because their Graph subsite set is empty), total wall-clock is approximately `N × (T_graph + T_rest)`. For 200 sites this is 70–160 seconds — matching the reported "long runtimes".

**Secondary drivers:**

- **Graph tenant pagination is also sequential** (`:303-325`). Each `@odata.nextLink` page is awaited before the next. For very large tenants this adds on top of the per-site cost.
- **REST recursion creates its own client at depth 0** (`:671`) but reuses it through recursion (`:718-721`). Good. However, the client has a hardcoded 30-s timeout with no explicit connect timeout (F6), so a single hung site can pause discovery 30 s.
- **429 retry blocks the entire discovery loop** (F7). A single throttled site stalls all subsequent sites.
- **MSAL cache reset on every call** (F12) adds ~100–300 ms per discovery run.
- **Method 2 and Method 3 are dead code on most runs** — they only execute when Method 1 returns zero sites — so they are not performance contributors in the typical path.

**No evidence of retries on Graph errors.** Graph error branches (`:321-325`, `:549-596`) do not retry; they log and break or swallow. This is actually *good* for wall-clock performance but contributes to F3's silent-error risk.

**Concurrency opportunities (not to be implemented per review scope):** the per-site auto-detect loop at `:362-427` is the obvious candidate for `asyncio.gather` with a bounded semaphore; the nested REST recursion at `:718-721` is inherently serial per branch and less interesting.

---

## 6. Permissions analysis

**Graph calls — `_get_sharepoint_access_token` at `:50`, scope `https://graph.microsoft.com/.default` (`:75`).** The implicit Azure AD application permissions required (app-only) are:

- `Sites.Read.All` — sufficient for `GET /v1.0/sites`, `GET /v1.0/sites/{host}:{/path}`, `GET /v1.0/sites/{id}/sites`. The current code only reads, so `Sites.FullControl.All` is not necessary from Graph's perspective for site discovery alone.
- Whether `Sites.Selected` is usable here depends on whether the tenant has granted the app per-site access. The code's client-side substring filter over `/sites` (F10) suggests the deployment currently assumes tenant-wide `Sites.Read.All`.

**SharePoint REST calls — `_get_sharepoint_token_for_rest` at `:598`, scope `https://{domain}/.default` (`:627`).** This acquires an **app-only** token against the **SharePoint Online resource** (distinct from Graph). Calls against `https://{host}/_api/web/webs` (`:674-677`) require one of two permission models:

1. **Modern (recommended) — `Sites.Selected` under the "Office 365 SharePoint Online" API.** The app must *also* be granted per-site access by a SharePoint admin via Graph's `POST /v1.0/sites/{site-id}/permissions` or `Grant-PnPAzureADAppSitePermission`. Without the per-site grant, REST returns **401/403** — which is exactly the reported symptom. This would light up the branch at `:402-408`.
2. **Classic — `AllowAppOnlyPolicy` via ACS / SharePoint add-in principal.** Historically granted in `appinv.aspx` with `Sites.FullControl.All` under the SharePoint (not Graph) resource. This has been the traditional way to make `/_api/web/webs` work tenant-wide for Classic subsite enumeration. Note Microsoft has been deprecating ACS — new tenants may have `DisableCustomAppAuthentication $true`, which outright blocks app-only SharePoint REST and will also return 401 regardless of how permissions are configured.

**Gap between Graph and SPO REST permissions in the current code.** Graph `Sites.Read.All` does **not** imply SharePoint REST app-only access. The fact that Graph works today (auto-detect can always reach `/sites/{id}/sites`) while REST returns 401 for many sites indicates the tenant has Graph `Sites.Read.All` consented but no SharePoint app-only trust path. To make the REST fallback succeed end-to-end on those tenants, one of the following must be configured (no action to be taken as part of this review):

- Grant the app `Sites.Selected` under the **SharePoint Online** API and issue per-site grants for every top-level site the operator wants probed; **or**
- Grant the app `Sites.FullControl.All` under the **SharePoint Online** API (broad, tenant-wide) and ensure `DisableCustomAppAuthentication` is `$false` on the tenant; **or**
- Fall back to the classic ACS model with `AllowAppOnlyPolicy=True` and `FullControl` (legacy, deprecating).

The current log message at `:402-408` — `grant SharePoint application permissions e.g. Sites.Read.All and admin consent` — is **partially misleading**: `Sites.Read.All` granted under Graph (which is the most common configuration) does not unblock `/_api/web/webs`. The hint should mention the **SharePoint Online** resource and `Sites.Selected`/`Sites.FullControl.All`.

**Token-acquisition vs token-use.** `acquire_token_for_client` succeeds as long as the app is registered in AAD with *any* scope under `https://{domain}`. It does not validate that the app actually has SharePoint permissions. This is why `_get_sharepoint_token_for_rest` can return a token and REST can still 401 (F9).

---

## 7. Open questions

1. **Intent of the `CLASSIC` label in F1 scenarios.** Is `CLASSIC` meant to describe tenant topology or simply "this site has subsites"? Modern communication sites can also return Graph subsites; labeling them CLASSIC may confuse operators. Confirm whether the label should actually be `HAS_SUBSITES` / `NO_SUBSITES` / `UNKNOWN`.
2. **Method 2 / Method 3 coverage.** Should the auto-detect block also apply to sites discovered via the root-site and `$filter` fallbacks (F1)? Currently only Method 1 results are probed.
3. **Target permissions model.** Which SharePoint app-only permission model is the team standardizing on — `Sites.Selected` with per-site grants, tenant-wide `Sites.FullControl.All`, or ACS? This affects whether the 401 log message should recommend `Sites.Selected` (`:402-408`).
4. **Expected max site count.** Roughly how many top-level sites does a "full-domain discovery" touch in production? This determines whether sequential probing (F5) is acceptable or whether bounded concurrency is required.
5. **`max_depth` intent (F2).** Should the Graph recursion default be 5 or 10? Both values appear in the code; one is almost certainly unintended.
6. **Dedup across Graph + REST (F8).** Is the `rest:<url>` id namespace intentional, and is it acceptable that a subsite reached by both paths appears twice in the response? Downstream consumers (e.g., `_load_registered_site_keys` at `edms_sites.py:977`) should be checked.
7. **Retry budget on Graph subsite calls (F3).** Should `_get_all_subsites` distinguish 401/403/429/5xx from 404, and should it retry on 429/5xx?
8. **`Retry-After` clamping (F7).** Is there a reasonable upper bound the team wants to enforce on server-supplied `Retry-After` values?
9. **MSAL cache reuse (F12).** Is discovery invoked frequently enough that lifting the MSAL app instance to module scope would be worthwhile?
10. **Graph `/sites` without `search=*` (F10).** Has the team verified on production tenants that this returns the full list and is not subject to the historical "created-by-me" restriction?
