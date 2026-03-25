# Feature Explanation: OIDs and Group OIDs Resolution -- Revver vs SharePoint

> **Generated from actual code analysis. No assumptions made.**
> **Date:** 2026-03-25

---

## What is this feature?

`oids` and `group_oids` are Azure AD Object IDs that control security trimming -- they determine which users and groups can see a given document in the Azure AI Search index. When a document is indexed, the system resolves human-readable identifiers (email addresses, group names) into Azure AD Object IDs so that search queries can enforce access control. SharePoint and Revver use fundamentally different resolution strategies, and the Revver path has multiple conditional branches that can silently produce empty lists.

---

## Where does this happen in the code?

| File | Responsibility |
|------|----------------|
| `backend/app/services/file_processing_worker_service.py` | Central orchestrator: builds `resolved_owner_oid` (oids) and `resolved_group_oids` for both SharePoint and Revver |
| `backend/app/services/acl_resolution_service.py` | Revver-specific: resolves Revver node permissions to Azure AD user OIDs and group OIDs |
| `backend/app/services/document_fetchers/revver_document_fetcher.py` | Fetches Revver node permissions via API; sets initial `group_oids` from `site.source_config` |
| `backend/app/services/document_fetchers/sharepoint_document_fetcher.py` | Sets `group_oids` from `site.source_config` during document fetch |
| `backend/app/services/document_fetchers/base_document_fetcher.py` | Base class; `_extract_metadata_for_queue()` sets `group_oids` from `site.source_config` |
| `backend/app/services/edms_site_service.py` | Create/update site: resolves group display names to Azure AD group OIDs and stores in `source_config.group_oids` |
| `backend/app/scheduler/tasks.py` | `IndexDataEnrichment`: resolves owner email to OID via Graph API, resolves group names to OIDs via Graph API |
| `backend/app/services/edms_document_service.py` | `get_sharepoint_site_groups()`: auto-fetches group OIDs from SharePoint site permissions |
| `backend/app/models/inbound_int_role_mapping.py` | Database model: maps Revver source roles to Azure AD group OIDs |
| `backend/app/services/role_mapping_service.py` | Syncs Revver roles from API and resolves Azure AD group OIDs for the mapping table |
| `backend/app/prepdocslib/searchmanager.py` | Final consumer: writes `oids` and `groups` fields into Azure AI Search documents |
| `frontend/src/pages/SharePointManagement/SharePoint_Instance/components/SiteFormModal.jsx` | UI form: collects `owner` and `groups` from the user during site create/edit |

---

## Step-by-Step Execution Flow

### PART A: Site Creation / Update (Groups and Owner are Persisted)

#### Step 1: User submits site form (frontend)
- **File:** `frontend/src/pages/SharePointManagement/SharePoint_Instance/components/SiteFormModal.jsx`
- **Function:** `handleSubmit()` (line ~987)
- **What happens:** The form collects `owner` (email string) and `groups` (array of display name strings) and sends them as a payload to the backend via `edmsService.createSite()` or `edmsService.updateSite()`.
- **Code snippet:**
```javascript
const payload = {
  ...formData,
  tags: formData.tags,
  groups: formData.groups,     // Array of group display names
  source_config: formData.source_config,
  // ...
};
```

#### Step 2: Backend persists site and resolves group_oids (create)
- **File:** `backend/app/services/edms_site_service.py`
- **Function:** `create_site()` (line ~266)
- **What happens:** Site is created with `owner` and `groups` fields. Then, if `groups` is non-empty, the system calls `IndexDataEnrichment.resolve_groups_to_oids()` to convert group display names to Azure AD OIDs. The resolved OIDs are stored in `source_config["group_oids"]`.
- **Code snippet:**
```python
# Line 324-376
if new_site.groups:
    groups_string = ",".join(groups_list)  # e.g. "IT - Data Engineering,PDMI"
    group_oids = await IndexDataEnrichment.resolve_groups_to_oids(groups_string)
    if group_oids:
        new_site.source_config["group_oids"] = group_oids
        flag_modified(new_site, "source_config")
```

#### Step 2b: SharePoint auto-fetch fallback (create, SharePoint only)
- **File:** `backend/app/services/edms_site_service.py`
- **Function:** `create_site()` (line ~399)
- **What happens:** If NO groups are provided AND the site is SharePoint, the system automatically fetches groups from the SharePoint site itself via Microsoft Graph API.
- **CRITICAL DIFFERENCE:** This auto-fetch only runs for `site_type == "sharepoint"`. Revver sites with no groups get nothing.
- **Code snippet:**
```python
# Line 397-448
else:
    # No groups provided
    if new_site.site_type == "sharepoint" and new_site.site_id:
        # Auto-fetch groups from SharePoint -- ONLY FOR SHAREPOINT
        groups_result = await EDMSDocumentService.get_sharepoint_site_groups(new_site.site_id)
        group_oids = groups_result.get("group_oids", [])
    else:
        # Revver and other types: nothing happens, group_oids stays empty
        logger.debug("No groups provided for site, skipping group OID resolution")
```

#### Step 3: Backend persists site and resolves group_oids (update)
- **File:** `backend/app/services/edms_site_service.py`
- **Function:** `update_site()` (line ~616)
- **What happens:** On update, the groups field uses APPEND semantics (merges new groups with existing). Group OID resolution runs if groups were updated OR if `source_config.group_oids` is missing.
- **Code snippet:**
```python
# Line 588-603 -- Groups are APPENDED, not replaced
if field == "groups" and value:
    existing_groups = edms_site.groups or []
    existing_lower = {g.lower() for g in existing_groups if g}
    new_groups = [g for g in value if g and g.lower() not in existing_lower]
    merged_groups = existing_groups + new_groups

# Line 690-695 -- Group OIDs are also MERGED
existing_oids = edms_site.source_config.get("group_oids", [])
merged_oids = list(set(existing_oids + group_oids))
edms_site.source_config["group_oids"] = merged_oids
```

#### Step 3b: SharePoint auto-fetch fallback (update, SharePoint only)
- **File:** `backend/app/services/edms_site_service.py`
- **Function:** `update_site()` (line ~727)
- **What happens:** Same as create -- if no groups exist and it is a SharePoint site, auto-fetch is attempted. **Revver sites do not get this fallback.**
- **Code snippet:**
```python
# Line 727-731
if (
    edms_site.site_type == "sharepoint"
    and edms_site.site_id
    and not edms_site.groups
    and not has_group_oids
):
    # Auto-fetch -- only for SharePoint
```

---

### PART B: Document Processing (OIDs are Resolved Per-File)

#### Step 4: Worker builds index metadata
- **File:** `backend/app/services/file_processing_worker_service.py`
- **Function:** `_build_index_metadata()` (line 1482)
- **What happens:** This is the central metadata builder called for every file being indexed. It constructs `resolved_owner_oid` and `resolved_group_oids`.

##### Step 4a: Initial owner OID resolution (both SharePoint and Revver)
- **Line:** 1576-1580
- **What happens:** For SharePoint, `file_record.created_by` contains `{"user": {"id": "<azure-ad-oid>", "email": "..."}}` -- the `id` field IS the Azure AD OID directly. For Revver, `created_by` is `{"email": "someuser@domain.com"}` -- there is NO `id` field.
- **Code snippet:**
```python
resolved_owner_oid: Optional[str] = None
if file_record.created_by:
    owner_id = file_record.created_by.get("user", {}).get("id")
    if owner_id:
        resolved_owner_oid = owner_id
```
- **ROOT CAUSE #1:** For Revver, `created_by` is `{"email": "user@domain.com"}` (set at line 1109 of `revver_document_fetcher.py`). There is no `.user.id` path. So `resolved_owner_oid` starts as `None` for Revver documents at this point.

##### Step 4b: Initial group_oids from source_config (both SharePoint and Revver)
- **Line:** 1582-1588
- **What happens:** Loads `group_oids` from `site.source_config["group_oids"]`. This is the SAME for both providers.
- **Code snippet:**
```python
resolved_group_oids = []
if site.source_config:
    group_oids = site.source_config.get("group_oids", [])
    if group_oids:
        resolved_group_oids = group_oids if isinstance(group_oids, list) else [group_oids]
```
- **ROOT CAUSE #2:** If `source_config["group_oids"]` was never populated during site create/update (because groups were not provided and there is no auto-fetch for Revver), this returns `[]`.

##### Step 4c: Revver ACL resolution (Revver ONLY)
- **Line:** 1594-1668
- **What happens:** For Revver sites, the system calls `resolve_acls()` which fetches node permissions from the Revver API and resolves them to Azure AD OIDs.
- **Code snippet:**
```python
if site.site_type == "revver" and file_record.file_id:
    acl_oids, acl_groups = await resolve_acls(
        site_id=site.id,
        file_id=file_record.file_id,
        org_edms_provider_id=site.org_edms_provider_id,
        fetcher=fetcher,
        cabinet_node_id=parent_id,
    )
```

##### Step 4d: Revver user OID fallback chain
- **Line:** 1618-1647
- **What happens:** If `resolve_acls()` returns NO user OIDs, the system tries two fallbacks:
  1. Resolve `file_record.created_by.email` via Microsoft Graph API
  2. Resolve `site.owner` email via Microsoft Graph API
- **Code snippet:**
```python
if not acl_oids:
    # Fallback 1: created_by email
    creator_email = (file_record.created_by.get("user") or {}).get("email")
    if creator_email and "@" in str(creator_email):
        fb_oid = await resolve_user_email_to_oid(str(creator_email).strip())
        if fb_oid:
            acl_oids = [fb_oid]

    # Fallback 2: site.owner email
    if not acl_oids and site.owner and "@" in str(site.owner).strip():
        fb_oid = await resolve_user_email_to_oid(site.owner.strip())
        if fb_oid:
            acl_oids = [fb_oid]
```
- **ROOT CAUSE #3 (oids missing for Revver):** The `created_by` structure for Revver is `{"email": "user@domain.com"}`, but the fallback looks for `file_record.created_by.get("user") or {}` then `.get("email")`. Since Revver's `created_by` has no `"user"` key, `("user") or {}` returns `{}`, and `.get("email")` returns `None`. **The first fallback silently fails due to key structure mismatch.** Only the second fallback (`site.owner`) can work, and only if the site has an owner email configured.

##### Step 4e: Merging ACL results
- **Line:** 1648-1674
- **What happens:** If user OIDs were found via ACL resolution, they are stored in `sharepoint_metadata["resolved_owner_oid"]`. ACL group OIDs are merged with the `source_config` group OIDs.
- **Code snippet:**
```python
if acl_oids:
    if resolved_owner_oid:
        acl_oids = list(set(acl_oids + [resolved_owner_oid]))
    resolved_owner_oid = acl_oids[0] if acl_oids else resolved_owner_oid
    sharepoint_metadata["resolved_owner_oid"] = acl_oids
if acl_groups:
    resolved_group_oids = list(set(resolved_group_oids + acl_groups))

# Final assignment
sharepoint_metadata["resolved_owner_oid"] = (
    sharepoint_metadata.get("resolved_owner_oid")
    or ([resolved_owner_oid] if resolved_owner_oid else [])
)
sharepoint_metadata["resolved_group_oids"] = resolved_group_oids
```

---

### PART C: Revver ACL Resolution Deep Dive

#### Step 5: Fetch node permissions from Revver API
- **File:** `backend/app/services/document_fetchers/revver_document_fetcher.py`
- **Function:** `_get_node_permissions()` (line 1316)
- **What happens:** Calls `GET /api/NodePermissions/NodeId/{id}` on the Revver API. Returns a list of permission objects.
- **Code snippet:**
```python
url = f"{self.base_url}/api/NodePermissions/NodeId/{node_id}"
result = await self._make_request_with_retry("GET", url)
```

#### Step 6: Classify each permission entry
- **File:** `backend/app/services/acl_resolution_service.py`
- **Function:** `_extract_role_type()` (line 164)
- **What happens:** Determines whether a permission entry is a Guest (1), User (2), or Group (3). Checks `roleData.roleType` first, then top-level `roleType`, then uses a heuristic (contains `@` = user, otherwise = group).
- **Code snippet:**
```python
# Priority 1: roleData.roleType
role_data = perm.get("roleData") or perm.get("RoleData")
if isinstance(role_data, dict):
    rd_type = role_data.get("roleType") or role_data.get("RoleType")
    if rd_type is not None:
        return int(rd_type)

# Priority 2: top-level roleType
top_type = perm.get("roleType") or perm.get("RoleType")

# Priority 3: heuristic
role_field = (perm.get("role") or perm.get("Role") or "").strip()
return REVVER_ROLE_TYPE_USER if "@" in role_field else REVVER_ROLE_TYPE_GROUP
```
- **ROOT CAUSE #4 (group_oids missing via ACL):** If `roleData` is absent or malformed, AND the `role` field does not contain `@`, the permission is classified as a Group. But if the group role has no matching entry in `inbound_int_role_mapping`, `resolve_group_to_oid()` returns `None` and the group OID is lost.

#### Step 7: Resolve user permissions to OIDs
- **File:** `backend/app/services/acl_resolution_service.py`
- **Function:** `resolve_user_email_to_oid()` (line 46)
- **What happens:** Extracts email from `roleData.userName`, then resolves to Azure AD OID via `IndexDataEnrichment.resolve_owner_to_oid()` (Microsoft Graph API).
- **ROOT CAUSE #5 (oids missing via ACL):** If the email in `roleData.userName` does not exist in Azure AD (external user, service account, etc.), Graph API returns 404 and the OID is `None`.

#### Step 8: Resolve group permissions to OIDs
- **File:** `backend/app/services/acl_resolution_service.py`
- **Function:** `resolve_group_to_oid()` (line 97)
- **What happens:** Looks up the Revver role in the `inbound_int_role_mapping` database table using `source_role_id` first, then `source_role_name` as fallback.
- **Code snippet:**
```python
# Primary: match by source_role_id
result = await db.execute(
    select(InboundIntRoleMapping.azure_ad_group_oid).where(
        and_(
            InboundIntRoleMapping.org_edms_provider_id == org_edms_provider_id,
            InboundIntRoleMapping.source_role_id == str(role_id),
            InboundIntRoleMapping.is_active == 1,
        )
    )
)
# Fallback: match by source_role_name
```
- **ROOT CAUSE #6 (group_oids missing via ACL):** If the `inbound_int_role_mapping` table is missing the mapping for a given Revver role (i.e., `azure_ad_group_oid` is NULL or the row does not exist), the group OID cannot be resolved. The `role_mapping_service.py` must have been run to sync Revver roles AND the admin must have mapped them to Azure AD groups.

---

### PART D: How Search Index Receives OIDs

#### Step 9: SearchManager writes oids and groups to index
- **File:** `backend/app/prepdocslib/searchmanager.py`
- **Function:** `create_sections()` (line ~610)
- **What happens:** Takes `sharepoint_metadata["resolved_owner_oid"]` and writes it as `document["oids"]`. Takes `sharepoint_metadata["resolved_group_oids"]` and writes it as `document["groups"]`.
- **Code snippet:**
```python
# Line 611-618
if sharepoint_metadata:
    document["oids"] = sharepoint_metadata.get("resolved_owner_oid", [])
    document["groups"] = sharepoint_metadata.get("resolved_group_oids", [])
```

#### Step 10: Metadata-only updates also write oids/groups
- **File:** `backend/app/services/file_processing_worker_service.py`
- **Function:** `_update_index_metadata_only()` (line ~1991)
- **What happens:** For metadata-only updates (no re-indexing), oids and groups are patched directly.
- **Code snippet:**
```python
owner_oids = sharepoint_metadata.get("resolved_owner_oid", [])
if owner_oids:
    metadata_updates["oids"] = owner_oids
group_oids = sharepoint_metadata.get("resolved_group_oids", [])
if group_oids is not None:
    metadata_updates["groups"] = group_oids
```

---

## What is the code ACTUALLY doing?

### SharePoint Resolution Path (Working)

1. **Owner OID:** SharePoint items from Graph API include `createdBy.user.id` which IS the Azure AD OID. No resolution needed -- it is directly available at `file_record.created_by.get("user", {}).get("id")` in `_build_index_metadata()` (line 1578).

2. **Group OIDs (site-level):** During site create/update, `edms_site_service.py` resolves group display names to Azure AD OIDs via `IndexDataEnrichment.resolve_groups_to_oids()` and stores them in `source_config["group_oids"]`. Additionally, SharePoint has an auto-fetch fallback via `get_sharepoint_site_groups()` that queries the Graph API for site permissions directly (lines 399 and 727).

3. **Net result for SharePoint:** `resolved_owner_oid` always has a value (from Graph API item metadata). `resolved_group_oids` always has values (from `source_config` populated during create/update, or auto-fetched from SharePoint permissions).

### Revver Resolution Path (Inconsistent)

1. **Owner OID (initial attempt):** `file_record.created_by` for Revver is `{"email": "user@domain.com"}` -- NOT `{"user": {"id": "...", "email": "..."}}`. The code at line 1578 does `created_by.get("user", {}).get("id")` which returns `None`. **The owner OID starts as None.**

2. **Group OIDs (site-level):** Same mechanism as SharePoint -- from `source_config["group_oids"]`. But Revver has NO auto-fetch fallback (the auto-fetch at line 399 only runs for `site_type == "sharepoint"`). If the user did not provide groups during site creation, `source_config["group_oids"]` is empty.

3. **Revver ACL resolution:** The `resolve_acls()` function in `acl_resolution_service.py` is called ONLY for Revver. It fetches node permissions from the Revver API and resolves them. However:
   - **User OIDs depend on:** roleData having userName with a valid email that exists in Azure AD
   - **Group OIDs depend on:** `inbound_int_role_mapping` table having the role mapped with a non-null `azure_ad_group_oid`
   - If either lookup fails, the respective list is empty

4. **Fallback chain for user OIDs:** If ACL resolution returns no user OIDs:
   - Fallback 1: `file_record.created_by.get("user") or {}` then `.get("email")` -- **THIS FAILS** because Revver's `created_by` is `{"email": "..."}` not `{"user": {"email": "..."}}`. The `.get("user")` returns `None`, `None or {}` evaluates to `{}`, and `{}.get("email")` returns `None`.
   - Fallback 2: `site.owner` email resolved via Graph API -- works only if `site.owner` is set.

5. **Net result for Revver:** `resolved_owner_oid` may be empty if ACL resolution fails AND the fallback chain fails. `resolved_group_oids` may be empty if `source_config["group_oids"]` was never populated AND the `inbound_int_role_mapping` table has no Azure AD OID for the Revver roles.

---

## Important Notes

### Root Causes Summary

| # | Root Cause | Affects | Location |
|---|-----------|---------|----------|
| 1 | Revver `created_by` has no `.user.id` path -- owner OID extraction at line 1578 always returns `None` | `oids` | `file_processing_worker_service.py:1578` |
| 2 | No auto-fetch of group OIDs for Revver sites (only SharePoint gets `get_sharepoint_site_groups()`) | `group_oids` | `edms_site_service.py:399` and `edms_site_service.py:727` |
| 3 | Fallback #1 for Revver user OID uses wrong key path (`created_by.user.email` vs actual `created_by.email`) | `oids` | `file_processing_worker_service.py:1622` |
| 4 | Heuristic roleType classification can misclassify entries when `roleData` is absent | `oids` / `group_oids` | `acl_resolution_service.py:205-208` |
| 5 | User emails from Revver may not exist in Azure AD (external users, service accounts) | `oids` | `acl_resolution_service.py:46-94` |
| 6 | `inbound_int_role_mapping` may lack Azure AD group OIDs for Revver roles (not synced or not mapped) | `group_oids` | `acl_resolution_service.py:97-161` |

### Scenarios Where oids Come Through But group_oids Are Missing

- **Scenario A:** ACL resolution finds user-type permissions (roleType 1 or 2) with valid emails in Azure AD, but the group-type permissions (roleType 3) have no matching entries in `inbound_int_role_mapping`.
- **Scenario B:** The site has an `owner` email that resolves via the second fallback, but `source_config["group_oids"]` was never populated (no groups provided at site creation, no auto-fetch for Revver).

### Scenarios Where group_oids Come Through But oids Are Missing

- **Scenario C:** `source_config["group_oids"]` was populated during site creation (user provided groups), but ACL resolution returns no user OIDs (all user emails are unresolvable in Azure AD), AND the fallback chain fails (wrong key path for `created_by`, no `site.owner` set).
- **Scenario D:** `inbound_int_role_mapping` has group mappings, but all user-type permissions have emails that do not exist in Azure AD.

### Key Structural Differences: SharePoint vs Revver

| Aspect | SharePoint | Revver |
|--------|-----------|--------|
| Owner OID source | Direct from Graph API item: `createdBy.user.id` | Must be resolved via ACL or fallback chain |
| `created_by` structure | `{"user": {"id": "oid", "email": "..."}}` | `{"email": "user@domain.com"}` -- no `id`, no `user` wrapper |
| Group OID auto-fetch | Yes -- `get_sharepoint_site_groups()` queries Graph API | **No** -- no equivalent auto-fetch exists |
| Group OID site-level | From `source_config["group_oids"]` (populated via `resolve_groups_to_oids`) | Same mechanism, but no fallback if empty |
| Group OID per-file | Not used -- relies on site-level only | `resolve_acls()` resolves per-cabinet from `inbound_int_role_mapping` |
| Group resolution dependency | Microsoft Graph API (display name lookup) | `inbound_int_role_mapping` table (must be pre-populated) |
| Owner fallback chain | Not needed -- OID is always in item metadata | 3-step: ACL user perms -> created_by email -> site.owner email |

---

## Explain Like I'm 10 Years Old

Imagine a library where every book has a list of people allowed to read it. When a new book arrives, the librarian needs to figure out who can read it.

For books from **Store A** (SharePoint), each book comes with a sticker that already says "John Smith, ID #12345 can read this." The librarian just copies the sticker.

For books from **Store B** (Revver), the book just says "Created by john@email.com" with no ID number. The librarian has to:
1. Call the phone company (Azure AD) to look up John's ID number
2. Check a big chart on the wall (the role mapping table) to figure out which reading clubs are allowed to see the book
3. If John's number is not in the phone book, the librarian tries to look up the store owner's number instead

Sometimes the phone company does not know who John is. Sometimes the reading club chart is missing some clubs. When that happens, some books end up with no ID numbers, meaning nobody can find them when they search.

---

## Summary

- Entry point: `file_processing_worker_service.py` -> `_build_index_metadata()` (line 1482)
- Key files involved:
  - `backend/app/services/file_processing_worker_service.py` (central orchestrator)
  - `backend/app/services/acl_resolution_service.py` (Revver ACL resolution)
  - `backend/app/services/edms_site_service.py` (site create/update group_oids resolution)
  - `backend/app/scheduler/tasks.py` (Graph API OID resolution)
  - `backend/app/services/document_fetchers/revver_document_fetcher.py` (Revver node permissions fetch)
  - `backend/app/services/edms_document_service.py` (SharePoint group auto-fetch)
  - `backend/app/models/inbound_int_role_mapping.py` (Revver role-to-Azure AD mapping)
  - `backend/app/prepdocslib/searchmanager.py` (writes to search index)
  - `frontend/src/pages/SharePointManagement/SharePoint_Instance/components/SiteFormModal.jsx` (UI)
- APIs called:
  - Microsoft Graph API `GET /v1.0/users/{upn}` (resolve email to OID)
  - Microsoft Graph API `GET /v1.0/groups?$filter=displayName eq '...'` (resolve group to OID)
  - Microsoft Graph API `GET /v1.0/sites/{siteId}/permissions` (SharePoint group auto-fetch)
  - Revver API `GET /api/NodePermissions/NodeId/{id}` (node permissions)
  - Revver API `GET /api/Role/Account/{accountId}` (account roles)
- Database operations:
  - `InboundIntRoleMapping` SELECT by `source_role_id` or `source_role_name` in `acl_resolution_service.py`
  - `EDMSSite.source_config["group_oids"]` JSON field read/write in `edms_site_service.py`
- Feature complexity: **High**
- Primary root causes of inconsistency:
  1. Revver `created_by` key structure mismatch (no `.user.id`, no `.user.email` wrapper) vs what the worker code expects
  2. No auto-fetch of group OIDs for Revver sites (only SharePoint has this)
  3. `inbound_int_role_mapping` table may not have Azure AD group OIDs populated for all Revver roles
