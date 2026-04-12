import { useMemo, useState } from 'react'

const strSort = (a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })

const focusH =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-container motion-safe:transition-colors'

const STAT_DEFS = [
  { key: 'files', label: 'Files', icon: '📁', valueClass: 'text-violet-600 dark:text-violet-400' },
  { key: 'entry', label: 'Entry Points', icon: '🚀', valueClass: 'text-sky-600 dark:text-sky-400' },
  { key: 'api', label: 'External APIs', icon: '🔌', valueClass: 'text-emerald-600 dark:text-emerald-400' },
  { key: 'db', label: 'DB Operations', icon: '🗄️', valueClass: 'text-amber-600 dark:text-amber-400' },
  { key: 'fn', label: 'Functions', icon: '⚙️', valueClass: 'text-red-600 dark:text-red-400' },
]

const EXT_BADGE = {
  py: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200',
  js: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
  jsx: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
  ts: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200',
  tsx: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200',
  json: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
  md: 'bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100',
}

const METHOD_BADGE = {
  GET: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
  POST: 'bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200',
  PUT: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
  DELETE: 'bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200',
  PATCH: 'bg-pink-100 text-pink-900 dark:bg-pink-950 dark:text-pink-200',
}

export default function MetaViewer({ meta }) {
  if (!meta) {
    return (
      <div className="rounded-lg border border-outline bg-surface-container px-6 py-8 text-sm text-on-surface-muted">
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
    <div className="flex min-w-0 max-w-full flex-col gap-6 md:gap-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 lg:gap-3">
        {stats.map((s) => (
          <StatCard key={s.key} icon={s.icon} value={s.value} label={s.label} valueClass={s.valueClass} />
        ))}
      </div>

      {sorted.entry_points.length > 0 && (
        <Section title="Entry Points" icon="🚀" count={sorted.entry_points.length}>
          {sorted.entry_points.map((ep, i) => (
            <EntryItem key={i} raw={ep} />
          ))}
        </Section>
      )}

      {sorted.files_involved.length > 0 && (
        <Section title="Files Involved" icon="📁" count={sorted.files_involved.length} collapsible>
          <div className="flex flex-wrap gap-2.5 p-5 md:p-5">
            {sorted.files_involved.map((f, i) => (
              <FileChip key={i} path={f} />
            ))}
          </div>
        </Section>
      )}

      {sorted.apis_used.length > 0 && (
        <Section title="External APIs" icon="🔌" count={sorted.apis_used.length} collapsible>
          {sorted.apis_used.map((api, i) => (
            <ApiItem key={i} raw={api} />
          ))}
        </Section>
      )}

      {sorted.db_operations.length > 0 && (
        <Section title="Database Operations" icon="🗄️" count={sorted.db_operations.length} collapsible>
          {sorted.db_operations.map((op, i) => (
            <DbItem key={i} raw={op} />
          ))}
        </Section>
      )}

      {functions_traced.length > 0 && (
        <Section title="Functions Traced" icon="⚙️" count={functions_traced.length} collapsible>
          <FunctionGroups items={sorted.functions_traced} />
        </Section>
      )}
    </div>
  )
}

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

function Section({ title, icon, count, children, collapsible = false }) {
  const [open, setOpen] = useState(true)

  if (collapsible) {
    return (
      <div className="overflow-hidden rounded-lg border border-outline bg-surface-container">
        <button
          type="button"
          className={`flex w-full items-center justify-between border-b border-outline bg-surface-container-high px-4 py-3 text-left hover:bg-outline-variant/30 md:px-5 ${focusH}`}
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <div className="flex items-center gap-2 text-sm font-bold text-on-surface">
            <span aria-hidden>{icon}</span>
            {title}
            <span className="inline-flex min-h-[22px] min-w-[22px] items-center justify-center bg-primary-container px-2 text-[11px] font-bold text-on-primary-container">
              {count}
            </span>
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
    <div className="overflow-hidden rounded-lg border border-outline bg-surface-container">
      <div className="border-b border-outline bg-surface-container-high px-4 py-3 md:px-5">
        <div className="flex items-center gap-2 text-sm font-bold text-on-surface">
          <span aria-hidden>{icon}</span>
          {title}
          <span className="inline-flex min-h-[22px] min-w-[22px] items-center justify-center bg-primary-container px-2 text-[11px] font-bold text-on-primary-container">
            {count}
          </span>
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
  const badge = EXT_BADGE[ext] ?? 'bg-surface-container-high text-on-surface dark:bg-surface-container-high'

  return (
    <div
      className="inline-flex min-w-0 max-w-full items-center gap-2 border border-outline bg-surface-container-high px-3 py-2 text-xs motion-safe:transition-colors hover:border-primary/30 hover:bg-primary-container/20"
      title={path}
    >
      <span className={`shrink-0 px-1 py-0.5 text-[10px] font-extrabold uppercase tracking-wide ${badge}`}>
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

  const mClass = METHOD_BADGE[method] ?? 'bg-surface-container-high text-on-surface'

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
        <span className="shrink-0 border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-mono text-xs font-bold text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
          {model}
        </span>
      )}
      {ops.length > 0 && (
        <span className="shrink-0 border border-amber-200 bg-amber-50 px-1.5 py-0.5 font-mono text-xs font-semibold text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
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
        className={`flex w-full items-center gap-2 border-b border-outline-variant bg-surface-container-high px-4 py-3 text-left hover:bg-outline-variant/40 md:px-5 ${focusH}`}
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
        <span className="ml-auto shrink-0 bg-primary-container px-2 py-0.5 text-[11px] font-semibold text-on-primary-container">
          {fns.length}
        </span>
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
