import { EmptyIcon } from '../../../components/icons'

export default function FeatureEmptyState() {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <EmptyIcon />
      <div>
        <p className="text-base font-medium text-on-surface">No feature selected</p>
        <p className="mt-1 text-sm text-on-surface-muted">Choose a feature from the sidebar</p>
      </div>
    </div>
  )
}
