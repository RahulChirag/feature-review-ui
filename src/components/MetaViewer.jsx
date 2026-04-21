import { forwardRef, useMemo } from 'react'
import { chromeMutedText } from '../theme/chromeStyles'
import MetaStats from '../features/feature-reviews/components/meta/MetaStats'
import EntryPointsSection from '../features/feature-reviews/components/meta/EntryPointsSection'
import FilesInvolvedSection from '../features/feature-reviews/components/meta/FilesInvolvedSection'
import ExternalApisSection from '../features/feature-reviews/components/meta/ExternalApisSection'
import DatabaseOperationsSection from '../features/feature-reviews/components/meta/DatabaseOperationsSection'
import FunctionTraceSection from '../features/feature-reviews/components/meta/FunctionTraceSection'
import {
  buildMetaStats,
  sortMetaCollections,
} from '../features/feature-reviews/components/meta/metaParsers'
import { normalizeFeatureMeta } from '../features/feature-reviews/lib/featureMetaNormalizer'

const EMPTY_META = {}

function ExtraMetaSection({ sections }) {
  if (sections.length === 0) return null

  return (
    <section className="rounded-lg border border-outline bg-surface-container px-4 py-3 md:px-5">
      <div className="flex items-center justify-between text-left">
        <span className="text-sm font-semibold text-on-surface">Additional metadata</span>
        <span className="text-xs text-on-surface-variant">{sections.length} sections</span>
      </div>
      <div className="mt-3 space-y-3">
        {sections.map((section) => (
          <div key={section.key} className="rounded-md border border-outline-variant px-3 py-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
              {section.label}
            </h4>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-on-surface">
              {section.items.map((item, index) => (
                <li key={`${section.key}-${index}`}>{item}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}

const MetaViewer = forwardRef(function MetaViewer({ featureId, issues = [], meta }, ref) {
  const safeMeta = meta ?? EMPTY_META
  const normalized = useMemo(() => normalizeFeatureMeta(safeMeta), [safeMeta])
  const sorted = useMemo(() => sortMetaCollections(safeMeta), [safeMeta])
  const stats = useMemo(() => buildMetaStats(safeMeta, normalized), [safeMeta, normalized])

  if (!meta) {
    return (
      <div
        ref={ref}
        className={`rounded-lg border border-outline bg-surface-container px-6 py-8 text-sm ${chromeMutedText}`}
      >
        <p>No metadata file found for this feature.</p>
        {featureId && (
          <p className="mt-2">
            Expected metadata at <code>feature-reviews/{featureId}/meta.json</code>.
          </p>
        )}
        {issues.length > 0 && (
          <ul className="mt-2 ml-5 list-disc space-y-1">
            {issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  return (
    <div ref={ref} className="flex min-w-0 max-w-full flex-col gap-6 md:gap-5">
      <MetaStats stats={stats} />
      <EntryPointsSection items={sorted.entry_points} />
      <FilesInvolvedSection items={sorted.files_involved} />
      <ExternalApisSection items={sorted.apis_used} />
      <DatabaseOperationsSection items={sorted.db_operations} />
      <FunctionTraceSection items={sorted.functions_traced} />
      <ExtraMetaSection sections={normalized.extraSections} />
    </div>
  )
})

export default MetaViewer
