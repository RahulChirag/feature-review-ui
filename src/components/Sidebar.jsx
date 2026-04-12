import FeatureNavShell from './FeatureNavShell'

/** Desktop feature rail — same navigation UI as mobile drawer ([`FeatureNavShell`](./FeatureNavShell.jsx)). */
export default function Sidebar(props) {
  return (
    <aside className="hidden min-h-0 w-[260px] shrink-0 flex-col overflow-hidden border-r border-outline bg-surface-container md:flex">
      <FeatureNavShell variant="rail" {...props} />
    </aside>
  )
}
