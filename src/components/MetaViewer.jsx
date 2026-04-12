import { useMemo, useState } from 'react'

const strSort = (a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })

export default function MetaViewer({ meta }) {
  if (!meta) {
    return <div className="doc-empty">No metadata file found for this feature.</div>
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

  return (
    <div className="meta-viewer">
      <div className="stats-row">
        <StatCard icon="📁" value={files_involved.length} label="Files" color="#7c3aed" />
        <StatCard icon="🚀" value={entry_points.length} label="Entry Points" color="#0ea5e9" />
        <StatCard icon="🔌" value={apis_used.length} label="External APIs" color="#10b981" />
        <StatCard icon="🗄️" value={db_operations.length} label="DB Operations" color="#f59e0b" />
        <StatCard icon="⚙️" value={functions_traced.length} label="Functions" color="#ef4444" />
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
          <div className="file-grid">
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

function StatCard({ icon, value, label, color }) {
  return (
    <div className="stat-card">
      <span className="stat-icon">{icon}</span>
      <span className="stat-value" style={{ color }}>
        {value}
      </span>
      <span className="stat-label">{label}</span>
    </div>
  )
}

function Section({ title, icon, count, children, collapsible = false }) {
  const [open, setOpen] = useState(true)

  if (collapsible) {
    return (
      <div className="meta-section">
        <button
          type="button"
          className="section-header clickable"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <div className="section-title">
            <span>{icon}</span>
            {title}
            <span className="count-badge">{count}</span>
          </div>
          <span
            className="collapse-arrow"
            style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
            aria-hidden
          >
            ▾
          </span>
        </button>
        {open && <div className="section-body">{children}</div>}
      </div>
    )
  }

  return (
    <div className="meta-section">
      <div className="section-header">
        <div className="section-title">
          <span>{icon}</span>
          {title}
          <span className="count-badge">{count}</span>
        </div>
      </div>
      <div className="section-body">{children}</div>
    </div>
  )
}

function EntryItem({ raw }) {
  const arrowIdx = raw.indexOf(' -> ')
  if (arrowIdx === -1) {
    return (
      <div className="entry-item">
        <span className="entry-detail">{raw}</span>
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
    <div className="entry-item">
      <code className="entry-file">{fileName}</code>
      <span className="entry-arrow">→</span>
      <code className="entry-method">{methodPart}</code>
      {descPart && <span className="entry-desc">{descPart}</span>}
    </div>
  )
}

function FileChip({ path }) {
  const parts = path.split('/')
  const name = parts.at(-1)
  const dir = parts.slice(0, -1).join('/')
  const ext = name.split('.').at(-1)
  return (
    <div className="file-chip" title={path}>
      <span className={`file-ext ext-${ext}`}>{ext}</span>
      <span className="file-chip-name">{name}</span>
      <span className="file-chip-dir">{dir}</span>
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

  return (
    <div className="api-item">
      <span className={`method-badge method-${method}`}>{method}</span>
      <code className="api-path">{path}</code>
      {desc && <span className="api-desc">{desc}</span>}
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
    <div className="db-item">
      {model && <span className="db-model">{model}</span>}
      {ops.length > 0 && <span className="db-ops">{ops.join(' ')}</span>}
      {filePart && <span className="db-file">{filePart.split('/').at(-1)}</span>}
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
    <div className="fn-group">
      <button
        type="button"
        className="fn-group-header"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="fn-group-arrow" aria-hidden>
          {open ? '▾' : '▸'}
        </span>
        {file !== 'unknown' && <span className="fn-group-dir">{filePath}/</span>}
        <span className="fn-group-file">{fileName}</span>
        <span className="fn-group-count">{fns.length}</span>
      </button>
      {open && (
        <div className="fn-list">
          {fns.map((fn, i) => (
            <div key={i} className="fn-item">
              <span className="fn-dot" />
              <code className="fn-name">{fn}</code>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
