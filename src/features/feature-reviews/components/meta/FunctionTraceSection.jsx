import { useMemo, useState } from 'react'
import { chromeCountBadge } from '../../../../theme/chromeStyles'
import { focusRingButton } from '../../../../theme/focusStyles'
import MetaSection from './MetaSection'
import { groupFunctionsByFile } from './metaParsers'

function FunctionGroup({ file, fns }) {
  const [open, setOpen] = useState(true)
  const fileName = file === 'unknown' ? 'Unknown file' : file.split('/').at(-1)
  const filePath = file === 'unknown' ? '' : file.split('/').slice(0, -1).join('/')

  return (
    <div className="border-b border-outline-variant last:border-b-0">
      <button
        type="button"
        className={`flex w-full items-center gap-2 border-b border-outline-variant bg-surface-container-high px-4 py-3 text-left hover:bg-outline-variant/40 md:px-5 ${focusRingButton}`}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span className="w-3 shrink-0 text-center text-xs text-on-surface-muted" aria-hidden>
          {open ? '▾' : '▸'}
        </span>
        {file !== 'unknown' && (
          <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-on-surface-muted">
            {filePath}/
          </span>
        )}
        <span className="shrink-0 font-mono text-[13px] font-bold text-on-surface">{fileName}</span>
        <span className={`${chromeCountBadge} ml-auto shrink-0`}>{fns.length}</span>
      </button>
      {open && (
        <div className="py-1.5">
          {fns.map((fn, index) => (
            <div
              key={`${file}-${fn}-${index}`}
              className="flex min-w-0 items-center gap-2.5 px-4 py-2 pl-9 md:px-5 md:pl-10"
            >
              <span className="h-1.5 w-1.5 shrink-0 bg-primary opacity-70" aria-hidden />
              <code className="min-w-0 max-w-full break-words font-mono text-[13px] text-primary">
                {fn}
              </code>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function FunctionTraceSection({ items }) {
  const groups = useMemo(() => groupFunctionsByFile(items), [items])

  if (groups.length === 0) return null

  return (
    <MetaSection
      title="Functions Traced"
      icon="⚙️"
      count={items.length}
      collapsible
      slug="functions-traced"
    >
      {groups.map(({ file, fns }) => (
        <FunctionGroup key={file} file={file} fns={fns} />
      ))}
    </MetaSection>
  )
}
