# AG Grid Table Review (Frontend)

> Generated from actual code analysis. No assumptions made.
> Date: 2026-04-21
> Branch: feat/doc-intel-module-improvements
> Repo root analyzed: `C:\NIQ\R-NeuroIQ-Admin-Portal\frontend`

This document reviews how AG Grid Community is used in the admin portal frontend so a developer new to the codebase can understand the existing tables and stand up a new one consistently.

---

## 1. Overview

### What AG Grid is used for

AG Grid is used as the primary data-table component on four screens in the portal:

1. Sites list (`/sites`) — server-backed pagination + sorting, client-side text/date/custom filters.
2. Site Sync Runs sites list (`/site-sync-runs`, when no site is selected) — reuses the Sites AG Grid table with a different Actions cell.
3. Per-site Files list (embedded inside `SiteFilesMasterDetail`) — fully client-side (sort, filter, paginate in-grid).
4. File Worker Management (`/worker-management`) — fully client-side with some columns that are display-only (status / in-flight live data).
5. Organization EDMS Providers (`OrgEdmsProviders`) — fully client-side, no footer pagination.

### Packages and versions

From `frontend/package.json` (lines 44–45):

```json
"ag-grid-community": "^35.2.1",
"ag-grid-react": "^35.2.1",
```

Resolved versions in `frontend/package-lock.json` (line 3998): `35.2.1` (Community edition; Enterprise is not installed).

No AG Grid Enterprise `LicenseManager` is imported anywhere (verified via `Grep` for `LicenseManager`). Module registration is not global — each feature registers its own Community modules via `AgGridProvider modules={...}` (see section 7).

### Where grids are wired into routes

`frontend/src/App.jsx`:
- Line 52: `const SitesAgGridPage = lazy(() => import("./pages/SitesAgGrid/SitesAgGridPage"));`
- Lines 67–69: `SharePointSyncRun` lazy import.
- Lines 70–72: `WorkerManagement` lazy import.
- Lines 81–83: `OrgEdmsProviders` lazy import.

---

## 2. Shared component anatomy

There is NO single shared `<DataGrid />` reusable component. Instead, each feature folder contains its own `*AgGridTable.jsx` that follows the same template. The closest thing to reuse is the Sites grid, which the Site Sync Runs page imports directly:

```jsx
// frontend/src/pages/SharePointManagement/SharePoint_Sync_Run/SharePointSyncRun.jsx:8
import SitesAgGridTable from "@/pages/SitesAgGrid/components/SitesAgGridTable";
```

And the Site Sync Runs page overrides the trailing Actions column via `columnOptions` (see `SharePointSyncRun.jsx:125–137`):

```jsx
const columnOptions = useMemo(
  () => ({
    actionsCellRenderer: SiteSyncRunsActionsCell,
    actionsCellRendererParams: {
      onViewRuns: handleViewRuns,
      onViewFiles: handleViewFiles,
    },
    actionsHeaderName: "Actions",
    actionsMinWidth: 150,
    actionsWidth: 170,
  }),
  [handleViewRuns, handleViewFiles],
);
```

The column-def builder `getSitesAgGridColumnDefs` supports this override explicitly (`sitesAgGridColumnDefs.js:86–117`):

```js
actionsCellRenderer,
actionsCellRendererParams,
actionsHeaderName = "Actions",
actionsMinWidth = 200,
actionsWidth = 220,
// ...
const resolvedActionsRenderer = actionsCellRenderer || SitesAgGridActionsCell;
const resolvedActionsParams  = actionsCellRendererParams || defaultActionParams;
```

The `OrgEdmsProvidersAgGrid.jsx` even reuses the Sites modules list (`OrgEdmsProvidersAgGrid.jsx:8`):

```js
import { sitesAgGridCommunityModules } from "@/pages/SitesAgGrid/agGridModules";
```

### Common props / API shape across the four `*AgGridTable.jsx` files

| Prop | Sites | Files | Worker | OrgEdms |
|------|-------|-------|--------|---------|
| `data` / `rowData` | `data` | `data` | `data` | `rowData` |
| `isFetching` (overlay) | yes | yes | yes | yes |
| Server paging/sorting props (`pageIndex`, `pageSize`, `totalCount`, `onPaginationChange`, `sorting`, `onSortingChange`) | yes | — | — | — |
| `columnOptions` (for overridable Actions cell) | yes | — | — | — |
| Row-click handler | — | `onRowClick` | — | — |
| Action handlers (Pause / Resume, Edit) | (via columnOptions) | — | `onPause`, `onResume`, `isPauseLoading`, `isResumeLoading`, `canPause`, `canResume` | `onOpenEdit` |

### Internal structure (same for every grid)

All four grids follow the same skeleton, visible in `SitesAgGridTable.jsx`, `FilesAgGridTable.jsx`, `WorkerAgGridTable.jsx`, and `OrgEdmsProvidersAgGrid.jsx`:

1. A local `useHtmlClassContains("dark")` hook observes the `<html class="dark">` token and returns a boolean (defined inline in each file — not extracted):

   ```jsx
   // frontend/src/pages/SitesAgGrid/components/SitesAgGridTable.jsx:10–21
   function useHtmlClassContains(className) {
     const [on, setOn] = useState(() => document.documentElement.classList.contains(className));
     useEffect(() => {
       const el = document.documentElement;
       const obs = new MutationObserver(() => { setOn(el.classList.contains(className)); });
       obs.observe(el, { attributes: true, attributeFilter: ["class"] });
       return () => obs.disconnect();
     }, [className]);
     return on;
   }
   ```
2. `gridTheme` is built from `themeQuartz.withPart(colorSchemeDark | colorSchemeLightCold)` (see section 7).
3. `columnDefs` from a `getXxxAgGridColumnDefs(...)` builder module.
4. `defaultColDef` memoized inline.
5. `<AgGridProvider modules={...}>` wraps `<AgGridReact />`.
6. A sticky footer pagination `DataTablePagination` (shadcn-style, from `@/components/DataTable/DataTablePagination`) renders below the grid — the native AG Grid pagination panel is suppressed via `suppressPaginationPanel`.

### Styling

No global AG Grid CSS is imported (`index.css` does not reference AG Grid). All theming is done via:
- JS theming API (`themeQuartz.withPart(...)`) — required for Quartz in AG Grid v33+.
- Tailwind arbitrary selectors on the wrapper to left-align the header:

  ```jsx
  // SitesAgGridTable.jsx:184–186
  "[&_.ag-header-cell-label]:justify-start [&_.ag-header-cell-text]:text-left",
  ```

  and on Files/Worker grids a center-aligned-header override:

  ```jsx
  // WorkerAgGridTable.jsx:234–236
  "[&_.ag-center-aligned-header_.ag-header-cell-label]:justify-center",
  ```

---

## 3. Screens using AG Grid

| Screen | Entry page component | Table component | Notes |
|--------|----------------------|-----------------|-------|
| Sites list (`/sites`) | `frontend/src/pages/SitesAgGrid/SitesAgGridPage.jsx` | `frontend/src/pages/SitesAgGrid/components/SitesAgGridTable.jsx` | Server paging/sort via React Query. Custom Category multi-select filter. Category options derived from current page's rows (line 59–74). Default sort `last_processed_at desc`. |
| Site Sync Runs (`/site-sync-runs`, sites view) | `frontend/src/pages/SharePointManagement/SharePoint_Sync_Run/SharePointSyncRun.jsx` | Re-imports `SitesAgGridTable` | Overrides the Actions cell via `columnOptions.actionsCellRenderer = SiteSyncRunsActionsCell`. Uses a dedicated React Query key `site-sync-runs-sites` (see `useSiteSyncRunsPage.js:19`). |
| Files list (per site) | Embedded in `SiteFilesMasterDetail.jsx` → `RunFilesPanel.jsx` | `frontend/src/pages/SharePointManagement/Document_Files_Process/components/FilesAgGridTable.jsx` | Fully client-side. Rows are clickable (`onRowClick` opens details modal). Declarative default sort on `file_name asc`. |
| File Worker Management (`/worker-management`) | `frontend/src/pages/SharePointManagement/Worker_Management/WorkerManagement.jsx` | `frontend/src/pages/SharePointManagement/Worker_Management/components/WorkerAgGridTable.jsx` | Client-side. Mix of sortable + display-only columns. Live in-flight column refreshed via `api.refreshCells({ columns: ["in_flight"], force: true })`. |
| Org EDMS Providers | `frontend/src/pages/DocumentIntelligence/EDMS_Providers/OrgEdmsProviders.jsx` | `frontend/src/pages/DocumentIntelligence/EDMS_Providers/OrgEdmsProvidersAgGrid.jsx` | Client-side. No footer pagination. Column-level `comparator`s for string/date/bool. Declarative default sort applied imperatively in `onGridReady`. |

### Column-def builders

- `frontend/src/pages/SitesAgGrid/components/sitesAgGridColumnDefs.js` → exports `getSitesAgGridColumnDefs()` and `SITES_AG_GRID_SERVER_SORT_COL_IDS`.
- `frontend/src/pages/SharePointManagement/Document_Files_Process/components/filesAgGridColumnDefs.js` → exports `getFilesAgGridColumnDefs()` and `FILES_AG_GRID_SORTABLE_COL_IDS`.
- `frontend/src/pages/SharePointManagement/Worker_Management/components/workerAgGridColumnDefs.js` → exports `getWorkerAgGridColumnDefs()` and `WORKER_AG_GRID_SORTABLE_COL_IDS`.
- Org EDMS has its column defs inlined inside `OrgEdmsProvidersAgGrid.jsx:181–260`.

### Custom cell renderer files

- Sites: `SitesAgGridActionsCell.jsx`, `SitesAgGridStatusCell.jsx`, `SitesAgGridCategorySelectFilter.jsx`, `SitesAgGridFilterDateInput.jsx`.
- Files: `FilesAgGridCells.jsx` (bundle of `FileTypeIconCell`, `FileNameCell`, `ProcessingStatusCell`, `ActionStatusCell`, `FileSizeCell`, `LastModifiedCell`), `FilesEnumSelectFilter.jsx`, `FileStatusBadges.jsx`.
- Worker: `WorkerAgGridCells.jsx` (bundle of `WorkerNameCell`, `JobIdCell`, `JobTypeCell`, `IntervalCell`, `NextRunCell`, `InFlightCell`, `StatusCell`, `ActionsCell`).
- Org EDMS: cells are inline in `OrgEdmsProvidersAgGrid.jsx` (`StatusCell`, `ValidationCell`, `ProviderNameCell`, `AuthTypeCell`). Actions cell split out as `OrgEdmsProvidersActionsCell.jsx`.

### Modules files (one per grid)

- `frontend/src/pages/SitesAgGrid/agGridModules.js` — `sitesAgGridCommunityModules`.
- `frontend/src/pages/SharePointManagement/Document_Files_Process/filesAgGridModules.js` — `filesAgGridCommunityModules` (adds `NumberFilterModule`).
- `frontend/src/pages/SharePointManagement/Worker_Management/workerAgGridModules.js` — `workerAgGridCommunityModules`.
- Org EDMS reuses the Sites modules list.

---

## 4. Data flow walkthrough (representative screen: `/sites`)

This section traces user interactions on the Sites AG Grid page end-to-end.

### 4.1 Initial mount

1. Route `/sites` resolves to `SitesAgGridPage` (`App.jsx:52, 234`).
2. `SitesAgGridPage` (line 18) calls `useSitesAgGridPage()` from `./hooks/useSitesAgGridPage.js`.
3. The hook sets up local state (lines 95–104): `pageIndex = 0`, `pageSize = 20`, `tableSorting = [{ id: "last_processed_at", desc: true }]`, `submittedParams = null`.
4. A seeding effect (lines 130–137) waits for the `useOrganizationScope` context to become ready, then sets `submittedParams` to `{ ...DEFAULT_SITES_LIST_PARAMS, organization: workspaceOrgId || "all" }` — so the very first `/sites` request goes out with the right org id.
5. A `useQuery` (lines 256–271) with key `[SITES_AG_GRID_QUERY_KEY, submittedParams, pageIndex, pageSize, sortKey]` calls `edmsService.listSites(params)` with `limit`, `offset`, `sort_by`, `sort_direction`, `search`, `organization_id`, `provider`, `status`.
6. The page extracts `sites` and `sitesTotal` via `parseListSitesResponse` (lines 273–281).
7. The hook returns those along with handlers, which `SitesAgGridPage` passes into `<SitesAgGridTable />` (lines 207–217).

### 4.2 Inside `SitesAgGridTable`

- `useHtmlClassContains("dark")` drives dark/light theme swap (line 40).
- `categoryFilterOptions` is derived from the current page's `data` (lines 59–74) and passed into the `Category` column's custom filter via `getSitesAgGridColumnDefs({ ...columnOptions, categoryFilterOptions })` (lines 76–79).
- `defaultColDef` (lines 81–92):
  ```js
  { resizable: true, sortable: false, suppressHeaderMenuButton: true, minWidth: 64,
    cellStyle: { textAlign: "left" }, headerStyle: { textAlign: "left" } }
  ```
- `<AgGridProvider modules={sitesAgGridCommunityModules}>` at line 172 scopes the module registration.
- `<AgGridReact>` (lines 189–206) receives `theme={gridTheme}`, `rowData={data}`, `columnDefs={columnDefs}`, `defaultColDef`, `getRowId={(p) => String(p.data?.id ?? "")}`, `onGridReady`, `onSortChanged`, `onFirstDataRendered`, `suppressPaginationPanel`, `animateRows`, `headerHeight={36}`, `rowHeight={36}`, `enableCellTextSelection`, `suppressCellFocus`, `domLayout="normal"`.

### 4.3 Sorting interaction (server-side)

1. User clicks a sortable column header (e.g. `display_name`).
2. AG Grid fires `onSortChanged` (lines 144–169). The handler reads the new column state via `event.api.getColumnState()` and finds the single sorted entry.
3. If the sorted column id is not in `SITES_AG_GRID_SERVER_SORT_COL_IDS` (`display_name`, `category`, `owner`, `is_active`, `last_processed_at` — defined in `sitesAgGridColumnDefs.js:12–18`), the handler snaps the header back to `last_processed_at desc` and, if different, forwards that to React state.
4. Otherwise it forwards `[{ id, desc }]` to the parent via `onSortingChange(...)`.
5. `onTableSortingChange` in the hook (lines 377–380) calls `setTableSorting(...)` and `setPageIndex(0)`.
6. The React Query key changes → refetch with `sort_by` + `sort_direction` params → new rows → AG Grid redraws.
7. A `useLayoutEffect` (lines 139–142) calls `syncGridSortFromProps` so the header chevron stays aligned with React state after data changes.

### 4.4 Filtering interaction (client-side)

- The Name column uses `agTextColumnFilter` (provided by `TextFilterModule`).
- The Category column uses the custom `SitesAgGridCategorySelectFilter` (a multi-select popover using `useGridFilter`).
- The Last process at column uses `agDateColumnFilter` with a custom `lastModifiedDateComparator` and a custom `dateComponent` (`SitesAgGridFilterDateInput`) that provides a native `<input type="date">` and auto-blurs after pick.

Text / date / custom filters all run client-side on the already-paginated server data.

### 4.5 Pagination interaction (server-side)

- `suppressPaginationPanel` on `<AgGridReact>` hides the built-in footer.
- A custom `DataTablePagination` (imported at line 5, rendered at 221–235) is rendered below the grid.
- `onPageChange` and `onPageSizeChange` call `onPaginationChange({ pageIndex, pageSize })` → `onTablePaginationChange` in the hook → `setPageIndex` / `setPageSize` → React Query key changes → refetch.

### 4.6 Row actions

- The trailing `actions` column (`sitesAgGridColumnDefs.js:288–301`) renders `SitesAgGridActionsCell` with `cellRendererParams` containing the handler functions (`openInfo`, `handleEdit`, `fetchAndPushDocuments`, `handleSyncStatus`, `handleDeactivate`, `handleRestore`) and permission flags.
- The cell uses `forwardRef` + `useImperativeHandle` to expose a `refresh()` method (required by AG Grid for custom cell renderers):
  ```jsx
  // SitesAgGridActionsCell.jsx:22–27
  const SitesAgGridActionsCell = forwardRef((props, ref) => {
    useImperativeHandle(ref, () => ({
      refresh() { return true; },
    }));
  ```

---

## 5. Column definitions & custom cell renderer patterns

### 5.1 Column definition shape

Every colDef is a plain object (JSDoc-typed as `import('ag-grid-community').ColDef`). Observed fields in use across the four grids:

- `colId` or `field` (often both).
- `headerName`.
- `flex` (ratio) and/or `width` / `minWidth` / `maxWidth`.
- `sortable` (true/false per column; `defaultColDef.sortable` is `false`).
- `sort` and `sortIndex` for declarative initial sort (Files and Worker grids).
- `sortingOrder` — e.g. `["asc", "desc"]` or `["desc", "asc"]` to control the click cycle.
- `comparator` — server-backed grids pass `() => 0` to disable AG Grid's client reorder on pre-sorted data.
- `filter` — string (`agTextColumnFilter`, `agDateColumnFilter`, `agNumberColumnFilter`) or custom React component.
- `filterParams` — common pattern: `{ buttons: ["apply", "reset"], closeOnApply: true, debounceMs: 150 }`.
- `floatingFilter` — always `false` in the codebase.
- `suppressHeaderMenuButton` / `suppressHeaderFilterButton` — toggled to allow the filter icon on a column-by-column basis.
- `dateComponent` — custom date-input for the Sites grid.
- `valueGetter`, `filterValueGetter`, `valueFormatter`, `tooltipValueGetter`, `tooltipField` — used to shape data for display / tooltip / filter.
- `cellRenderer` — React component.
- `cellRendererParams` — object forwarded to the renderer (handlers, permission flags, enum-option lists, data refs).
- `cellStyle`, `headerStyle` — static objects or functions of `(p) => ({...})` for conditional coloring.
- `pinned: "right"` and `lockPinned: true` + `suppressMovable: true` on the Sites actions column.
- `resizable: false` on narrow fixed-width columns (icon columns, actions).
- `headerClass` — used for `ag-right-aligned-header` in the Files Size column.

### 5.2 Custom cell renderer pattern

Two patterns are used:

a) Plain function component (no ref handling) — the majority, e.g. `WorkerNameCell`, `FileNameCell`, `ProcessingStatusCell`, `StatusCell`, etc. They read `props.data`, `props.value`, and optional `props.<customParam>`.

b) `forwardRef` + `useImperativeHandle({ refresh: () => true })` — used when AG Grid needs a refresh hook, e.g.:

```jsx
// frontend/src/pages/SitesAgGrid/components/SitesAgGridStatusCell.jsx:6–11
const SitesAgGridStatusCell = forwardRef((props, ref) => {
  useImperativeHandle(ref, () => ({
    refresh() { return true; },
  }));
  // ...
});
```

Seen in `SitesAgGridActionsCell.jsx`, `SitesAgGridStatusCell.jsx`, and `OrgEdmsProvidersActionsCell.jsx`.

### 5.3 Cell-style tinted text convention

Sites grid colors `Schedule` and `Process Status` via a `cellStyle` callback so columns read as a calm horizontal band (no badge chrome):

```js
// sitesAgGridColumnDefs.js:197–204 (Schedule)
cellStyle: (p) => ({
  textAlign: "left",
  fontWeight: 500,
  fontSize: "11px",
  textTransform: "capitalize",
  color: scheduleColor(p.data?.schedule_frequency),
}),
```

The same 11px / capitalize / tinted approach is reused in `WorkerAgGridCells.jsx` (see header comment at lines 27–45).

### 5.4 Custom filter pattern (`useGridFilter`)

Custom filters register their logic via `useGridFilter` from `ag-grid-react`. The shape:

```js
// SitesAgGridCategorySelectFilter.jsx:135–139
useGridFilter({
  doesFilterPass,
  getModelAsString,
  afterGuiAttached,
});
```

And the file-level comment at lines 9–13 explains the v35 wrapper contract:

> `ag-grid-react 35+ FilterComponentWrapper passes onModelChange / onUiChange (not filterChangedCallback).
> Filter logic must be registered with useGridFilter so providedMethods.doesFilterPass exists on the wrapper;
> forwardRef + useImperativeHandle alone do not call setMethods from CustomContext.`

The Apply / Reset flow is:
- Draft selection lives in both a `useState` (for render) and a `useRef` (for synchronous read in `apply()`).
- `onModelChange(null)` means "no filter applied"; `onModelChange({ filterType, values })` applies.
- `hidePopupRef` is captured from `afterGuiAttached` so the popup can close on Apply / Reset.

`FilesEnumSelectFilter.jsx` is a generic version of this pattern (options passed in via `filterParams.options`) reused on two columns (`processing_status`, `action_status`) in the Files grid — see `filesAgGridColumnDefs.js:151–176`.

---

## 6. Pagination, sorting, filtering, and selection behavior

### 6.1 Pagination

Two models are in use:

A) Server-side pagination (Sites grid used on both `/sites` and `/site-sync-runs`):
- `<AgGridReact>` is NOT given `pagination`. All paging is driven by React state (`pageIndex`, `pageSize`) → React Query key → new request.
- `suppressPaginationPanel` on the grid.
- Footer is `DataTablePagination` component, passed `currentPage`, `totalPages`, `pageSize`, `totalCount`, `pageSizeOptions={[20, 50, 100, 200]}`.

B) Client-side pagination (Files, Worker grids):
- `<AgGridReact pagination paginationPageSize={pageSize} suppressPaginationPanel />`.
- Page changes go through `api.paginationGoToPage(n)` and `api.updateGridOptions({ paginationPageSize })`.
- Filtered count is read from `api.getDisplayedRowCount()` on `onModelUpdated` / `onPaginationChanged`.
- Org EDMS Providers has no footer pagination at all (only sort / small list).

### 6.2 Sorting

- Server-side (Sites): only colIds in `SITES_AG_GRID_SERVER_SORT_COL_IDS` are allowed. `onSortChanged` snaps any disallowed sort back to the canonical default (`last_processed_at desc`) and forwards the change to React. All column `comparator`s return `0` so AG Grid does not reorder client-side over server-sorted data.
- Client-side (Files, Worker, Org EDMS): declarative `sort: "asc"` + `sortIndex: 0` on the default column (e.g. `file_name`, `name`). `onSortChanged` guards against non-allowed columns by snapping back.
- `defaultColDef.sortable = false`; columns opt in.

### 6.3 Filtering

- Text filter: `agTextColumnFilter` on Name / File Name / Worker / Job ID / Owner.
- Date filter: `agDateColumnFilter` with custom `comparator` (day-precision) on Last process at / Last Modified / Next Run.
- Number filter: `agNumberColumnFilter` on the Files grid Size column.
- Custom multi-select: `SitesAgGridCategorySelectFilter` (category options derived from current page rows) and `FilesEnumSelectFilter` (fixed enum options per column).
- `filterParams.buttons = ["apply", "reset"]` is the project convention. A comment in `workerAgGridColumnDefs.js:96–101` notes this explicitly:

  > Filter button order matches the Sites + Sync Runs grids (`["apply", "reset"]`), i.e. Apply on the left, Reset on the right. This is the project-wide convention; Files is the outlier and will be normalised separately if requested.

  (The Files grid has since been normalised — see `filesAgGridColumnDefs.js:120–130`.)

### 6.4 Selection

Row selection is not used. None of the four grids set `rowSelection`, `onSelectionChanged`, or checkbox selection. Instead, row-level affordances are rendered inside the Actions cell (or, in the Files grid, the entire row opens the details modal via `onRowClicked`).

Cells are text-selectable (`enableCellTextSelection`) but cell focus is suppressed (`suppressCellFocus`). `domLayout="normal"`.

### 6.5 Loading / empty / paint-flash handling

- Initial paint: grids that rely on declarative initial sort (Files, Worker) hide the grid with `opacity-0` until `onFirstDataRendered` fires, then fade in:

  ```jsx
  // FilesAgGridTable.jsx:200–202
  "transition-opacity duration-150 ease-out",
  isFirstRenderDone ? "opacity-100" : "opacity-0",
  ```
- Server refetch: Sites grid shows a blocking overlay while `isFetching` is true:

  ```jsx
  // SitesAgGridTable.jsx:98–100, 208–220
  const showBlockingOverlay = data.length > 0 && (!hasGridFirstPaint || isFetching);
  ```
- Column sizing on first paint and container resize:

  ```jsx
  // FilesAgGridTable.jsx:88–104
  const onFirstDataRendered = useCallback((event) => { event.api.sizeColumnsToFit(); ... });
  const onGridSizeChanged  = useCallback((event) => { if (!event?.clientWidth) return; event.api.sizeColumnsToFit(); });
  ```
- Empty state: Org EDMS uses `overlayNoRowsTemplate` (`OrgEdmsProvidersAgGrid.jsx:321`); Sites / Files / Worker pages render a separate "no rows" UI outside the grid.

---

## 7. Theming, licensing, and global setup

### 7.1 Theming

Every table uses the JS theming API (Quartz + a color-scheme part) — no `ag-theme-*` CSS import. Identical theme block in each file:

```jsx
// SitesAgGridTable.jsx:53–57 (and same in FilesAgGridTable, WorkerAgGridTable, OrgEdmsProvidersAgGrid)
const gridTheme = useMemo(
  () =>
    isDark ? themeQuartz.withPart(colorSchemeDark) : themeQuartz.withPart(colorSchemeLightCold),
  [isDark],
);
```

A comment in `SitesAgGridTable.jsx:26–27` notes:

> Theming: `themeQuartz` + `colorSchemeLightCold` (light) / `colorSchemeDark` (dark) for header chrome and consistent backgrounds. Legacy `ag-theme-*` CSS alone does not apply Quartz.

Dark-mode switching reacts to the `dark` class on `<html>` via the `useHtmlClassContains` MutationObserver hook defined inline in each grid file.

### 7.2 Module registration

Modules are NOT registered globally via `ModuleRegistry.registerModules(...)` (grep confirms no such call in the frontend). Each grid wraps its `<AgGridReact>` in an `<AgGridProvider modules={...}>` with a feature-local module list. For example:

```js
// frontend/src/pages/SitesAgGrid/agGridModules.js:33–52
export const sitesAgGridCommunityModules = [
  LocaleModule,
  ClientSideRowModelModule,
  ClientSideRowModelApiModule,
  ColumnApiModule,
  ColumnAutoSizeModule,
  CustomFilterModule,
  DateFilterModule,
  RowApiModule,
  ScrollApiModule,
  CellApiModule,
  CellStyleModule,
  ValueCacheModule,
  RenderApiModule,
  EventApiModule,
  PaginationModule,
  GridStateModule,
  TooltipModule,
  TextFilterModule,
];
```

The Files grid list is the same plus `NumberFilterModule` (`filesAgGridModules.js:12, 49`). The Worker grid list is the Sites list (no number filter). Org EDMS reuses the Sites list.

The file-level comment in `agGridModules.js:22–32` captures the "cherry-pick" philosophy:

> Community modules only (no Enterprise). Cherry-picked for this grid: client-side rows, columns (resize/reorder), sorting UI, pagination state, and core APIs.

### 7.3 Licensing

No AG Grid Enterprise license is configured. A global `Grep` for `LicenseManager` returns nothing; `package.json` only lists `ag-grid-community` and `ag-grid-react`.

### 7.4 Global styles

No `ag-grid-community.css`, `ag-theme-*.css`, or grid-specific CSS files are imported (verified via `Grep` over `frontend/src` for `ag-grid` in `.css` files). All styling lives inside the table components via Tailwind arbitrary selectors on the wrapper `<div>`.

---

## 8. Step-by-step: implementing AG Grid in a new screen

The following steps are derived strictly from conventions already used in the codebase (Sites / Files / Worker / Org EDMS).

### Step 1 — Create the feature folder

Use a folder layout like the existing ones. For example, for a hypothetical `MyFeature`:

```
pages/MyFeature/
├── MyFeaturePage.jsx                (page / route component)
├── myFeatureAgGridModules.js        (module list)
├── components/
│   ├── MyFeatureAgGridTable.jsx     (the grid)
│   ├── myFeatureAgGridColumnDefs.js (column defs + sortable id list)
│   ├── MyFeatureAgGridCells.jsx     (cell renderers, all in one JSX file)
│   └── MyFeatureActionsCell.jsx     (row actions — forwardRef)
└── hooks/
    └── useMyFeaturePage.js          (query + state if non-trivial)
```

Rationale: matches the folder shape under `pages/SitesAgGrid/` and `pages/SharePointManagement/Document_Files_Process/`.

### Step 2 — Create the modules list

Copy `frontend/src/pages/SitesAgGrid/agGridModules.js` (or `filesAgGridModules.js` if you need `NumberFilterModule`) and export an array named after your feature. Only add what your grid actually uses.

### Step 3 — Write the column-defs module

A plain `.js` module that exports:
- A builder function `getMyFeatureAgGridColumnDefs(options)` returning a `ColDef[]`.
- A `MY_FEATURE_AG_GRID_SORTABLE_COL_IDS` string array if you want a sortable allow-list.

Put all React-component cell renderers in a sibling `.jsx` file so the column-defs module stays plain JS (React Fast Refresh friendly — the Files grid specifically notes this at `FilesAgGridCells.jsx:7–10`).

For filters with dates, use a day-precision comparator copied from `sitesAgGridColumnDefs.js:24–41` / `filesAgGridColumnDefs.js:41–54`. For enum multi-select filters, reuse `FilesEnumSelectFilter` and pass `filterParams = { options, filterTypeId, getValue? }`.

### Step 4 — Build the table component

Copy the skeleton of `FilesAgGridTable.jsx` or `SitesAgGridTable.jsx` (depending on client vs server paging). Keep:
- `useHtmlClassContains("dark")` inlined.
- `gridTheme` with Quartz + color scheme.
- `<AgGridProvider modules={...}>` wrapping `<AgGridReact>`.
- `suppressPaginationPanel`, `enableCellTextSelection`, `suppressCellFocus`, `domLayout="normal"`, `headerHeight={36}`.
- `getRowId` returning a stable string.
- Footer: `<DataTablePagination variant="tableFooter" embedded ... pageSizeOptions={[20, 50, 100, 200]} />` from `@/components/DataTable/DataTablePagination`.
- Wrapper Tailwind classes for header alignment: `"[&_.ag-header-cell-label]:justify-start [&_.ag-header-cell-text]:text-left"`.

### Step 5 — Wire data

For server-backed paging + sort, follow `useSitesAgGridPage.js`:
- Store `pageIndex`, `pageSize`, `tableSorting` in local state.
- Compose a `queryKey` that includes all of them plus submitted filter params.
- Forward `sort_by` and `sort_direction` to the API based on the sortable allow-list.
- Use React Query options `placeholderData: (previousData) => previousData`, `staleTime: Infinity` (if appropriate for your data), and `refetchOnWindowFocus/Reconnect/Mount: false` where you want cached data to remain stable.

For client-side paging, pass the full row array to `rowData`, and use `pagination paginationPageSize={pageSize}` plus `onModelUpdated` / `onPaginationChanged` to refresh the footer (see `FilesAgGridTable.jsx:106–120`).

### Step 6 — Action cells

Wrap your action cell in `forwardRef` and expose `refresh()` (matches the pattern used by three of the four grids). Attach handlers via `colDef.cellRendererParams`, not via closure in the renderer — this keeps the column-def module plain `.js`.

### Step 7 — Register the page/route

Add a `lazy(() => import(...))` and a `createRoute`/`component:` entry in `frontend/src/App.jsx`, following the existing examples at lines 52, 67–72, 81–83, 234, 269, 276, 293.

### Step 8 — Integrate with `PageHeader`

All four existing grid pages use `@/components/PageHeader/PageHeader` with `center` (search), `toolbar` (view-mode toggle / refresh), and `subRow` (active filter chips / status pills). See `SitesAgGridPage.jsx:60–111` and `WorkerManagement.jsx:193–240` for memoization patterns (each slot memoized separately so the page-header effect deps stay stable).

---

## 9. Gotchas, open questions, and inconsistencies

### Gotchas the codebase calls out in comments

- **No global `ModuleRegistry`**. Each feature uses `<AgGridProvider modules={...}>`. If the grid warns about a missing module at runtime, add it to the feature's module file (note at `agGridModules.js:30–32`).
- **Quartz theming requires JS API**. `ag-theme-*` CSS alone does not apply Quartz in v33+ (`SitesAgGridTable.jsx:26–28`).
- **`useGridFilter` is required for custom filters in v35+**. `forwardRef`/`useImperativeHandle` alone does not satisfy the `FilterComponentWrapper` contract (`SitesAgGridCategorySelectFilter.jsx:9–13`).
- **Don't set `sort: "desc"` in a server-sorted colDef**. The Sites grid sets sort imperatively via `applyColumnState` on every data change because declarative `sort` reapplies on every `columnDefs` refresh and overrides the user's choice (`sitesAgGridColumnDefs.js:236–237`).
- **Avoid "skip next event" flags in `onSortChanged`**. A comment at `SitesAgGridTable.jsx:102–106` warns that such a flag can get stuck true and swallow the user's first click; the code uses `applyColumnState` idempotently instead.
- **`loadByWorker` polling would wipe grid state**. The Worker grid keeps `loadByWorker` on a ref so `cellRendererParams` identity stays stable across 5s polls and only calls `refreshCells({ columns: ["in_flight"], force: true })` (`WorkerAgGridTable.jsx:99–112`).
- **Pre-sort flash on first paint** is masked by hiding the grid with `opacity-0` until `onFirstDataRendered` fires (Files and Worker grids, `FilesAgGridTable.jsx:45–52`, `WorkerAgGridTable.jsx:79–85`).
- **First paint with server sort** is handled by an idempotent `applyColumnState` call inside `onGridReady` and in a `useLayoutEffect` after data changes — see `SitesAgGridTable.jsx:107–124, 139–142`.
- **Site `/sites?...` no-op re-fetch**. `submitSearchWithName` short-circuits when toolbar values already match `submittedParams` to prevent a new object reference from triggering a fresh query (`useSitesAgGridPage.js:313–320`).

### Inconsistencies across screens

- Column-defs live in a separate `.js` module for Sites, Files, and Worker, but are inlined inside `OrgEdmsProvidersAgGrid.jsx:181–260`.
- Row heights vary: Sites `36px`, Files `44px`, Worker `52px`, Org EDMS `58px` — each picked to fit that grid's cell density.
- Footer pagination is absent on Org EDMS (short list, no pager). All other grids have `DataTablePagination`.
- Actions column id varies: Sites uses `colId: "actions"`, Worker uses `colId: "__actions"`, Files has no actions column, Org EDMS uses `colId: "actions"`.
- Server-sort guard: Sites grid coerces bad sorts to `last_processed_at desc`. Worker grid coerces to `name asc`. Files grid coerces to `file_name asc`. Each grid hard-codes its own default.
- The Worker grid's modules file comment at `workerAgGridModules.js:22–26` references `.cursor/rules/ag-grid-community-only.mdc`, but no such file exists in the repo (verified via `Glob`). The rule is therefore only documented in inline comments.
- The Sites grid theme wrapper class is `sites-ag-grid-root`, Files uses `files-ag-grid-root`, Worker uses `worker-ag-grid-root`, Org EDMS has no such class. These names are not used by any CSS in the repo (verified via `Grep` — no matches in `.css` files). They appear to exist only as debug hooks.
- The `useHtmlClassContains` hook is duplicated inline in four files rather than extracted into a shared hook. Comments at `WorkerAgGridTable.jsx:12–17` note this deliberately: "Same hook copy used by `FilesAgGridTable` — kept inline here so the worker grid has zero cross-feature imports."

### Open questions (not resolvable from the codebase alone)

- Whether server-side row model or enterprise infinite scroll will be needed later (not used today).
- Whether the Org EDMS grid's inline column defs should be extracted for consistency with the other three grids.
- Whether row selection will ever be introduced (currently not used anywhere).

---

## 10. Quick index of files referenced

### Core grid files

- `frontend/package.json` (AG Grid deps at lines 44–45)
- `frontend/package-lock.json` (resolved version 35.2.1 at line 3998)
- `frontend/src/App.jsx` (lazy routes at 52, 67–72, 81–83; components at 234, 269, 276, 293)

### Sites grid (`/sites`)

- `frontend/src/pages/SitesAgGrid/SitesAgGridPage.jsx`
- `frontend/src/pages/SitesAgGrid/hooks/useSitesAgGridPage.js`
- `frontend/src/pages/SitesAgGrid/agGridModules.js`
- `frontend/src/pages/SitesAgGrid/components/SitesAgGridTable.jsx`
- `frontend/src/pages/SitesAgGrid/components/sitesAgGridColumnDefs.js`
- `frontend/src/pages/SitesAgGrid/components/SitesAgGridActionsCell.jsx`
- `frontend/src/pages/SitesAgGrid/components/SitesAgGridStatusCell.jsx`
- `frontend/src/pages/SitesAgGrid/components/SitesAgGridCategorySelectFilter.jsx`
- `frontend/src/pages/SitesAgGrid/components/SitesAgGridFilterDateInput.jsx`
- `frontend/src/pages/SitesAgGrid/components/SitesAgGridToolbar.jsx`
- `frontend/src/pages/SitesAgGrid/components/sitesAgGridFilterChips.js`

### Site Sync Runs (reuses Sites grid)

- `frontend/src/pages/SharePointManagement/SharePoint_Sync_Run/SharePointSyncRun.jsx`
- `frontend/src/pages/SharePointManagement/SharePoint_Sync_Run/hooks/useSiteSyncRunsPage.js`
- `frontend/src/pages/SharePointManagement/SharePoint_Sync_Run/components/SiteSyncRunsToolbar.jsx`

### Files grid (per-site)

- `frontend/src/pages/SharePointManagement/Document_Files_Process/filesAgGridModules.js`
- `frontend/src/pages/SharePointManagement/Document_Files_Process/components/FilesAgGridTable.jsx`
- `frontend/src/pages/SharePointManagement/Document_Files_Process/components/filesAgGridColumnDefs.js`
- `frontend/src/pages/SharePointManagement/Document_Files_Process/components/FilesAgGridCells.jsx`
- `frontend/src/pages/SharePointManagement/Document_Files_Process/components/FilesEnumSelectFilter.jsx`
- `frontend/src/pages/SharePointManagement/Document_Files_Process/components/FileStatusBadges.jsx`
- `frontend/src/pages/SharePointManagement/Document_Files_Process/components/RunFilesPanel.jsx`
- `frontend/src/pages/SharePointManagement/Document_Files_Process/components/SiteFilesMasterDetail.jsx`

### Worker grid

- `frontend/src/pages/SharePointManagement/Worker_Management/WorkerManagement.jsx`
- `frontend/src/pages/SharePointManagement/Worker_Management/workerAgGridModules.js`
- `frontend/src/pages/SharePointManagement/Worker_Management/components/WorkerAgGridTable.jsx`
- `frontend/src/pages/SharePointManagement/Worker_Management/components/workerAgGridColumnDefs.js`
- `frontend/src/pages/SharePointManagement/Worker_Management/components/WorkerAgGridCells.jsx`
- `frontend/src/pages/SharePointManagement/Worker_Management/components/index.js`

### Org EDMS Providers grid

- `frontend/src/pages/DocumentIntelligence/EDMS_Providers/OrgEdmsProviders.jsx`
- `frontend/src/pages/DocumentIntelligence/EDMS_Providers/OrgEdmsProvidersAgGrid.jsx`
- `frontend/src/pages/DocumentIntelligence/EDMS_Providers/OrgEdmsProvidersActionsCell.jsx`
