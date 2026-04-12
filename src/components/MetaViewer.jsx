import { forwardRef, useMemo, useState } from 'react'
import { chromeCountBadge, chromeMutedText } from '../theme/chromeStyles'
import { focusRingButton } from '../theme/focusStyles'

const strSort = (a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })

const STAT_DEFS = [
  { key: 'files', label: 'Files', icon: '📁', valueClass: 'text-primary' },
  { key: 'entry', label: 'Entry Points', icon: '🚀', valueClass: 'text-primary' },
  { key: 'api', label: 'External APIs', icon: '🔌', valueClass: 'text-primary' },
  { key: 'db', label: 'DB Operations', icon: '🗄️', valueClass: 'text-primary' },
  { key: 'fn', label: 'Functions', icon: '⚙️', valueClass: 'text-primary' },
]

/** Code-ish extensions: primary tint */
const EXT_BADGE_CODE =
  'rounded-sm border border-outline bg-primary/12 px-1 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-primary'
/** Data / config */
const EXT_BADGE_DATA =
  'rounded-sm border border-outline bg-primary-container/45 px-1 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-on-primary-container'
/** Docs / prose */
const EXT_BADGE_DOC =
  'rounded-sm border border-outline bg-outline-variant px-1 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-on-surface-variant'

const EXT_BADGE = {
  py: EXT_BADGE_CODE,
  js: EXT_BADGE_CODE,
  jsx: EXT_BADGE_CODE,
  ts: EXT_BADGE_CODE,
  tsx: EXT_BADGE_CODE,
  json: EXT_BADGE_DATA,
  md: EXT_BADGE_DOC,
}

/** Safe reads: elevated neutral surface */
const METHOD_SAFE = 'border border-outline bg-surface-container-high px-1.5 py-0.5 text-on-surface'
/** Writes: primary accent */
const METHOD_WRITE = 'border border-outline bg-primary/12 px-1.5 py-0.5 text-primary'
/** Destructive: stronger primary container */
const METHOD_DELETE = 'border border-outline bg-primary-container/90 px-1.5 py-0.5 text-on-primary-container'

const METHOD_BADGE = {
  GET: METHOD_SAFE,
  HEAD: METHOD_SAFE,
  POST: METHOD_WRITE,
  PUT: METHOD_WRITE,
  PATCH: METHOD_WRITE,
  DELETE: METHOD_DELETE,
}

const MetaViewer = forwardRef(function MetaViewer({ meta }, ref) {
  if (!meta) {
    return (
      <div
        ref={ref}
        className={`rounded-lg border border-outline bg-surface-container px-6 py-8 text-sm ${chromeMutedText}`}
      >
        No metadata file found for this feature.
      </div>
    )
  }

  const {
    files_involved = [],
    entry_points = [],
    apis_used = [],
    db_operations = [],
    functions_traced = [],
  } = meta

  const sorted = useMemo(
    () => ({
      entry_points: [...entry_points].sort(strSort),
      files_involved: [...files_involved].sort(strSort),
      apis_used: [...apis_used].sort(strSort),
      db_operations: [...db_operations].sort(strSort),
      functions_traced,
    }),
    [entry_points, files_involved, apis_used, db_operations, functions_traced]
  )

  const stats = [
    { ...STAT_DEFS[0], value: files_involved.length },
    { ...STAT_DEFS[1], value: entry_points.length },
    { ...STAT_DEFS[2], value: apis_used.length },
    { ...STAT_DEFS[3], value: db_operations.length },
    { ...STAT_DEFS[4], value: functions_traced.length },
  ]

  return (
    <div ref={ref} className="flex min-w-0 max-w-full flex-col gap-6 md:gap-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 lg:gap-3">
        {stats.map((s) => (
          <StatCard key={s.key} icon={s.icon} value={s.value} label={s.label} valueClass={s.valueClass} />
        ))}
      </div>

      {sorted.entry_points.length > 0 && (
        <Section title="Entry Points" icon="🚀" count={sorted.entry_points.length} slug="entry-points">
          {sorted.entry_points.map((ep, i) => (
            <EntryItem key={i} raw={ep} />
          ))}
        </Section>
      )}

      {sorted.files_involved.length > 0 && (
        <Section title="Files Involved" icon="📁" count={sorted.files_involved.length} collapsible slug="files-involved">
          <div className="flex flex-wrap gap-2.5 p-5 md:p-5">
            {sorted.files_involved.map((f, i) => (
              <FileChip key={i} path={f} />
            ))}
          </div>
        </Section>
      )}

      {sorted.apis_used.length > 0 && (
        <Section title="External APIs" icon="🔌" count={sorted.apis_used.length} collapsible slug="external-apis">
          {sorted.apis_used.map((api, i) => (
            <ApiItem key={i} raw={api} />
          ))}
        </Section>
      )}

      {sorted.db_operations.length > 0 && (
        <Section title="Database Operations" icon="🗄️" count={sorted.db_operations.length} collapsible slug="database-operations">
          {sorted.db_operations.map((op, i) => (
            <DbItem key={i} raw={op} />
          ))}
        </Section>
      )}

      {functions_traced.length > 0 && (
        <Section title="Functions Traced" icon="⚙️" count={functions_traced.length} collapsible slug="functions-traced">
          <FunctionGroups items={sorted.functions_traced} />
        </Section>
      )}
    </div>
  )
})

export default MetaViewer

function StatCard({ icon, value, label, valueClass }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg border border-outline bg-surface-container px-3 py-5 text-center">
      <span className="text-[22px]" aria-hidden>
        {icon}
      </span>
      <span className={`text-[26px] font-extrabold leading-none tabular-nums ${valueClass}`}>{value}</span>
      <span className="text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">{label}</span>
    </div>
  )
}

function Section({ title, icon, count, children, collapsible = false, slug }) {
  const [open, setOpen] = useState(true)

  const outlineProps = slug
    ? {
        id: `meta-section-${slug}`,
        'data-meta-section': true,
        'data-meta-title': title,
      }
    : {}

  if (collapsible) {
    return (
      <div
        {...outlineProps}
        className={`overflow-hidden rounded-lg border border-outline bg-surface-container ${slug ? 'scroll-mt-6' : ''}`}
      >
        <button
          type="button"
          className={`flex w-full items-center justify-between border-b border-outline bg-surface-container-high px-4 py-3 text-left hover:bg-outline-variant/30 md:px-5 ${focusRingButton}`}
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <div className="flex items-center gap-2 text-sm font-bold text-on-surface">
            <span aria-hidden>{icon}</span>
            {title}
            <span className={chromeCountBadge}>{count}</span>
          </div>
          <span
            className="inline-block text-on-surface-muted motion-safe:transition-transform"
            style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
            aria-hidden
          >
            ▾
          </span>
        </button>
        {open && <div>{children}</div>}
      </div>
    )
  }

  return (
    <div
      {...outlineProps}
      className={`overflow-hidden rounded-lg border border-outline bg-surface-container ${slug ? 'scroll-mt-6' : ''}`}
    >
      <div className="border-b border-outline bg-surface-container-high px-4 py-3 md:px-5">
        <div className="flex items-center gap-2 text-sm font-bold text-on-surface">
          <span aria-hidden>{icon}</span>
          {title}
          <span className={chromeCountBadge}>{count}</span>
        </div>
      </div>
      <div>{children}</div>
    </div>
  )
}

function EntryItem({ raw }) {
  const arrowIdx = raw.indexOf(' -> ')
  if (arrowIdx === -1) {
    return (
      <div className="min-w-0 border-b border-outline-variant px-4 py-3 text-sm text-on-surface-variant last:border-b-0 md:px-5">
        {raw}
      </div>
    )
  }

  const filePath = raw.slice(0, arrowIdx)
  const rest = raw.slice(arrowIdx + 4)
  const fileName = filePath.split('/').at(-1)

  const parenIdx = rest.indexOf(' (')
  const methodPart = parenIdx !== -1 ? rest.slice(0, parenIdx) : rest
  const descPart = parenIdx !== -1 ? rest.slice(parenIdx + 2, -1) : null

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2 border-b border-outline-variant px-4 py-3 last:border-b-0 md:px-5">
      <code className="max-w-full break-all border border-outline bg-code-bg px-1.5 py-0.5 font-mono text-[12px] font-bold text-on-surface">
        {fileName}
      </code>
      <span className="text-on-surface-muted">→</span>
      <code className="min-w-0 max-w-full flex-1 break-words font-mono text-[13px] font-semibold text-primary">
        {methodPart}
      </code>
      {descPart && (
        <span className="w-full border border-outline-variant bg-surface-container-high px-2 py-0.5 text-xs text-on-surface-muted sm:w-auto">
          {descPart}
        </span>
      )}
    </div>
  )
}

function FileChip({ path }) {
  const parts = path.split('/')
  const name = parts.at(-1)
  const dir = parts.slice(0, -1).join('/')
  const ext = name.split('.').at(-1)
  const badge = EXT_BADGE[ext] ?? 'rounded-sm border border-outline bg-surface-container-high px-1 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-on-surface'

  return (
    <div
      className="inline-flex min-w-0 max-w-full items-center gap-2 border border-outline bg-surface-container-high px-3 py-2 text-xs motion-safe:transition-colors hover:border-primary/30 hover:bg-primary-container/20"
      title={path}
    >
      <span className={`shrink-0 ${badge}`}>
        {ext}
      </span>
      <span className="min-w-0 break-all font-mono font-semibold text-on-surface">{name}</span>
      {dir && (
        <span className="min-w-0 max-w-[min(200px,40vw)] truncate font-mono text-[11px] text-on-surface-muted">{dir}</span>
      )}
    </div>
  )
}

function ApiItem({ raw }) {
  const withoutPrefix = raw.replace(/^External:\s*/i, '')
  const parts = withoutPrefix.split(' ')
  const method = parts[0]
  const rest = parts.slice(1).join(' ')

  const parenMatch = rest.match(/^(.+?)\s+\((.+)\)$/)
  const path = parenMatch ? parenMatch[1] : rest
  const desc = parenMatch ? parenMatch[2] : null

  const mClass = METHOD_BADGE[method] ?? METHOD_SAFE

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2 border-b border-outline-variant px-4 py-3 last:border-b-0 md:px-5">
      <span className={`shrink-0 px-1.5 py-0.5 font-mono text-[11px] font-extrabold ${mClass}`}>{method}</span>
      <code className="min-w-0 max-w-full flex-1 break-all font-mono text-[13px] text-on-surface">{path}</code>
      {desc && <span className="w-full text-xs text-on-surface-muted sm:w-auto">{desc}</span>}
    </div>
  )
}

function DbItem({ raw }) {
  const inIdx = raw.lastIndexOf(' in ')
  const filePart = inIdx !== -1 ? raw.slice(inIdx + 4) : null
  const opPart = inIdx !== -1 ? raw.slice(0, inIdx) : raw

  const opKeywords = [
    'INSERT',
    'SELECT',
    'UPDATE',
    'DELETE',
    'UPSERT',
    'CRUD',
    'INSERT/UPDATE',
    'SELECT/UPDATE',
    'SELECT/INSERT/UPDATE',
  ]
  const tokens = opPart.split(' ')
  let i = 0
  const modelParts = []
  while (i < tokens.length && !opKeywords.some((k) => tokens.slice(i).join(' ').startsWith(k))) {
    modelParts.push(tokens[i])
    i++
  }
  const model = modelParts.join(' ')
  const ops = tokens.slice(i)

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2 border-b border-outline-variant px-4 py-3 last:border-b-0 md:px-5">
      {model && (
        <span className="shrink-0 border border-outline bg-primary/12 px-2 py-0.5 font-mono text-xs font-bold text-primary">
          {model}
        </span>
      )}
      {ops.length > 0 && (
        <span className="shrink-0 border border-outline bg-surface-container-high px-1.5 py-0.5 font-mono text-xs font-semibold text-on-surface-variant">
          {ops.join(' ')}
        </span>
      )}
      {filePart && (
        <span className="min-w-0 break-all font-mono text-xs text-on-surface-muted">{filePart.split('/').at(-1)}</span>
      )}
    </div>
  )
}

function FunctionGroups({ items }) {
  const sortedGroups = useMemo(() => {
    const groups = {}
    items.forEach((raw) => {
      const inIdx = raw.lastIndexOf(' in ')
      if (inIdx === -1) {
        ;(groups.unknown ??= []).push(raw)
        return
      }
      const fn = raw.slice(0, inIdx)
      const file = raw.slice(inIdx + 4)
      ;(groups[file] ??= []).push(fn)
    })

    const keys = Object.keys(groups).filter((k) => k !== 'unknown')
    keys.sort(strSort)
    if (groups.unknown) keys.push('unknown')

    return keys.map((file) => ({
      file,
      fns: [...groups[file]].sort(strSort),
    }))
  }, [items])

  return (
    <>
      {sortedGroups.map(({ file, fns }) => (
        <FnGroup key={file} file={file} fns={fns} />
      ))}
    </>
  )
}

function FnGroup({ file, fns }) {
  const [open, setOpen] = useState(true)
  const fileName = file === 'unknown' ? 'Unknown file' : file.split('/').at(-1)
  const filePath = file === 'unknown' ? '' : file.split('/').slice(0, -1).join('/')

  return (
    <div className="border-b border-outline-variant last:border-b-0">
      <button
        type="button"
        className={`flex w-full items-center gap-2 border-b border-outline-variant bg-surface-container-high px-4 py-3 text-left hover:bg-outline-variant/40 md:px-5 ${focusRingButton}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="w-3 shrink-0 text-center text-xs text-on-surface-muted" aria-hidden>
          {open ? '▾' : '▸'}
        </span>
        {file !== 'unknown' && (
          <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-on-surface-muted">{filePath}/</span>
        )}
        <span className="shrink-0 font-mono text-[13px] font-bold text-on-surface">{fileName}</span>
        <span className={`${chromeCountBadge} ml-auto shrink-0`}>{fns.length}</span>
      </button>
      {open && (
        <div className="py-1.5">
          {fns.map((fn, i) => (
            <div key={i} className="flex min-w-0 items-center gap-2.5 px-4 py-2 pl-9 md:px-5 md:pl-10">
              <span className="h-1.5 w-1.5 shrink-0 bg-primary opacity-70" aria-hidden />
              <code className="min-w-0 max-w-full break-words font-mono text-[13px] text-primary">{fn}</code>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
