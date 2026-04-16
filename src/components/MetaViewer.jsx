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

const EMPTY_META = {}

const MetaViewer = forwardRef(function MetaViewer({ meta }, ref) {
  const safeMeta = meta ?? EMPTY_META
  const sorted = useMemo(() => sortMetaCollections(safeMeta), [safeMeta])
  const stats = useMemo(() => buildMetaStats(safeMeta), [safeMeta])

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

  return (
    <div ref={ref} className="flex min-w-0 max-w-full flex-col gap-6 md:gap-5">
      <MetaStats stats={stats} />
      <EntryPointsSection items={sorted.entry_points} />
      <FilesInvolvedSection items={sorted.files_involved} />
      <ExternalApisSection items={sorted.apis_used} />
      <DatabaseOperationsSection items={sorted.db_operations} />
      <FunctionTraceSection items={sorted.functions_traced} />
    </div>
  )
})

export default MetaViewer
