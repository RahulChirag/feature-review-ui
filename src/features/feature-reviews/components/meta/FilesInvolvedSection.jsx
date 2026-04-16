import MetaSection from './MetaSection'

const EXT_BADGE_CODE =
  'rounded-sm border border-outline bg-primary/12 px-1 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-primary'
const EXT_BADGE_DATA =
  'rounded-sm border border-outline bg-primary-container/45 px-1 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-on-primary-container'
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

export default function FilesInvolvedSection({ items }) {
  if (items.length === 0) return null

  return (
    <MetaSection
      title="Files Involved"
      icon="📁"
      count={items.length}
      collapsible
      slug="files-involved"
    >
      <div className="flex flex-wrap gap-2.5 p-5 md:p-5">
        {items.map((path) => {
          const parts = path.split('/')
          const name = parts.at(-1)
          const dir = parts.slice(0, -1).join('/')
          const ext = name.split('.').at(-1)
          const badge =
            EXT_BADGE[ext] ??
            'rounded-sm border border-outline bg-surface-container-high px-1 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-on-surface'

          return (
            <div
              key={path}
              className="inline-flex min-w-0 max-w-full items-center gap-2 border border-outline bg-surface-container-high px-3 py-2 text-xs motion-safe:transition-colors hover:border-primary/30 hover:bg-primary-container/20"
              title={path}
            >
              <span className={`shrink-0 ${badge}`}>{ext}</span>
              <span className="min-w-0 break-all font-mono font-semibold text-on-surface">{name}</span>
              {dir && (
                <span className="min-w-0 max-w-[min(200px,40vw)] truncate font-mono text-[11px] text-on-surface-muted">
                  {dir}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </MetaSection>
  )
}
