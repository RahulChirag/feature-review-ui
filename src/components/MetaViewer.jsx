import { useState } from 'react'

export default function MetaViewer({ meta }) {
  if (!meta) {
    return <div className="doc-empty">No metadata file found for this feature.</div>
  }

  const { files_involved = [], entry_points = [], apis_used = [], db_operations = [], functions_traced = [] } = meta

  return (
    <div className="meta-viewer">
      {/* Stats */}
      <div className="stats-row">
        <StatCard icon="📁" value={files_involved.length} label="Files" color="#7c3aed" />
        <StatCard icon="🚀" value={entry_points.length} label="Entry Points" color="#0ea5e9" />
        <StatCard icon="🔌" value={apis_used.length} label="External APIs" color="#10b981" />
        <StatCard icon="🗄️" value={db_operations.length} label="DB Operations" color="#f59e0b" />
        <StatCard icon="⚙️" value={functions_traced.length} label="Functions" color="#ef4444" />
      </div>

      {/* Entry Points */}
      {entry_points.length > 0 && (
        <Section title="Entry Points" icon="🚀" count={entry_points.length}>
          {entry_points.map((ep, i) => <EntryItem key={i} raw={ep} />)}
        </Section>
      )}

      {/* Files Involved */}
      {files_involved.length > 0 && (
        <Section title="Files Involved" icon="📁" count={files_involved.length} collapsible>
          <div className="file-grid">
            {files_involved.map((f, i) => <FileChip key={i} path={f} />)}
          </div>
        </Section>
      )}

      {/* APIs Used */}
      {apis_used.length > 0 && (
        <Section title="External APIs" icon="🔌" count={apis_used.length} collapsible>
          {apis_used.map((api, i) => <ApiItem key={i} raw={api} />)}
        </Section>
      )}

      {/* DB Operations */}
      {db_operations.length > 0 && (
        <Section title="Database Operations" icon="🗄️" count={db_operations.length} collapsible>
          {db_operations.map((op, i) => <DbItem key={i} raw={op} />)}
        </Section>
      )}

      {/* Functions Traced */}
      {functions_traced.length > 0 && (
        <Section title="Functions Traced" icon="⚙️" count={functions_traced.length} collapsible>
          <FunctionGroups items={functions_traced} />
        </Section>
      )}
    </div>
  )
}

/* ---- Sub-components ---- */

function StatCard({ icon, value, label, color }) {
  return (
    <div className="stat-card">
      <span className="stat-icon">{icon}</span>
      <span className="stat-value" style={{ color }}>{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  )
}

function Section({ title, icon, count, children, collapsible = false }) {
  const [open, setOpen] = useState(true)
  return (
    <div className="meta-section">
      <div
        className={`section-header${collapsible ? ' clickable' : ''}`}
        onClick={collapsible ? () => setOpen((v) => !v) : undefined}
      >
        <div className="section-title">
          <span>{icon}</span>
          {title}
          <span className="count-badge">{count}</span>
        </div>
        {collapsible && (
          <span className="collapse-arrow" style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}>
            ▾
          </span>
        )}
      </div>
      {open && <div className="section-body">{children}</div>}
    </div>
  )
}

function EntryItem({ raw }) {
  // Format: "path/to/file.py -> ClassName.method() (description)"
  const arrowIdx = raw.indexOf(' -> ')
  if (arrowIdx === -1) return <div className="entry-item"><span className="entry-detail">{raw}</span></div>

  const filePath = raw.slice(0, arrowIdx)
  const rest = raw.slice(arrowIdx + 4) // skip " -> "
  const fileName = filePath.split('/').at(-1)

  // Split method from description in parens
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
  // Format: "External: METHOD path (description)" or "External: METHOD path"
  const withoutPrefix = raw.replace(/^External:\s*/i, '')
  const parts = withoutPrefix.split(' ')
  const method = parts[0] // GET, POST, etc.
  const rest = parts.slice(1).join(' ')

  // Extract description in parens at end
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
  // Format: "Model OP in path/to/file.py" or "Model OP (detail) in path/to/file.py"
  const inIdx = raw.lastIndexOf(' in ')
  const filePart = inIdx !== -1 ? raw.slice(inIdx + 4) : null
  const opPart = inIdx !== -1 ? raw.slice(0, inIdx) : raw

  // Extract model + ops from the beginning (words before a known DB op keyword)
  const opKeywords = ['INSERT', 'SELECT', 'UPDATE', 'DELETE', 'UPSERT', 'CRUD', 'INSERT/UPDATE', 'SELECT/UPDATE', 'SELECT/INSERT/UPDATE']
  let model = null
  let ops = []

  const tokens = opPart.split(' ')
  // Collect leading non-op words as model, rest as ops
  let i = 0
  const modelParts = []
  while (i < tokens.length && !opKeywords.some((k) => tokens.slice(i).join(' ').startsWith(k))) {
    modelParts.push(tokens[i])
    i++
  }
  model = modelParts.join(' ')
  ops = tokens.slice(i)

  return (
    <div className="db-item">
      {model && <span className="db-model">{model}</span>}
      {ops.length > 0 && <span className="db-ops">{ops.join(' ')}</span>}
      {filePart && <span className="db-file">{filePart.split('/').at(-1)}</span>}
    </div>
  )
}

function FunctionGroups({ items }) {
  // Group by file
  const groups = {}
  items.forEach((raw) => {
    const inIdx = raw.lastIndexOf(' in ')
    if (inIdx === -1) {
      ;(groups['unknown'] ??= []).push(raw)
      return
    }
    const fn = raw.slice(0, inIdx)
    const file = raw.slice(inIdx + 4)
    ;(groups[file] ??= []).push(fn)
  })

  return (
    <>
      {Object.entries(groups).map(([file, fns]) => (
        <FnGroup key={file} file={file} fns={fns} />
      ))}
    </>
  )
}

function FnGroup({ file, fns }) {
  const [open, setOpen] = useState(true)
  const fileName = file.split('/').at(-1)
  const filePath = file.split('/').slice(0, -1).join('/')

  return (
    <div className="fn-group">
      <div className="fn-group-header" onClick={() => setOpen((v) => !v)}>
        <span className="fn-group-arrow">{open ? '▾' : '▸'}</span>
        <span className="fn-group-dir">{filePath}/</span>
        <span className="fn-group-file">{fileName}</span>
        <span className="fn-group-count">{fns.length}</span>
      </div>
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
