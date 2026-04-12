import { motion, useReducedMotion } from 'motion/react'
import FeatureNavShell from './FeatureNavShell'
import { transitionDesktopSidebar, transitionReducedOpacity } from '../theme/motionTokens'

/** Desktop feature rail — same navigation UI as mobile drawer ([`FeatureNavShell`](./FeatureNavShell.jsx)). */
export default function Sidebar({ open = true, ...props }) {
  const prefersReducedMotion = useReducedMotion()

  return (
    <motion.aside
      id="feature-sidebar"
      className={`hidden min-h-0 shrink-0 flex-col overflow-hidden border-r border-outline bg-surface-container md:flex ${open ? '' : 'pointer-events-none'}`}
      initial={false}
      animate={{
        width: open ? 260 : 0,
        borderRightWidth: open ? 1 : 0,
      }}
      transition={prefersReducedMotion ? transitionReducedOpacity : transitionDesktopSidebar}
      aria-hidden={!open}
    >
      <div className="flex h-full min-h-0 w-[260px] flex-col overflow-hidden">
        <FeatureNavShell variant="rail" {...props} />
      </div>
    </motion.aside>
  )
}
