import { useTheme } from './ThemeProvider'

const ring =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-active-border/80 focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar motion-safe:transition-shadow'

const ringMain =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface motion-safe:transition-shadow'

export default function ThemeToggle({ variant = 'default', className = '' }) {
  const { preference, setPreference } = useTheme()
  const isSidebar = variant === 'sidebar'
  const r = isSidebar ? ring : ringMain

  return (
    <div
      role="group"
      aria-label="Color theme"
      className={`inline-flex rounded-lg border p-0.5 shadow-sm ${
        isSidebar ? 'border-sidebar-border bg-sidebar-hover' : 'border-outline bg-surface-container'
      } ${className}`}
    >
      <ThemeBtn
        label="Light theme"
        pressed={preference === 'light'}
        onClick={() => setPreference('light')}
        isSidebar={isSidebar}
        r={r}
      >
        Light
      </ThemeBtn>
      <ThemeBtn
        label="Dark theme"
        pressed={preference === 'dark'}
        onClick={() => setPreference('dark')}
        isSidebar={isSidebar}
        r={r}
      >
        Dark
      </ThemeBtn>
      <ThemeBtn
        label="Match system theme"
        pressed={preference === 'system'}
        onClick={() => setPreference('system')}
        isSidebar={isSidebar}
        r={r}
      >
        System
      </ThemeBtn>
    </div>
  )
}

function ThemeBtn({ label, pressed, onClick, children, isSidebar, r }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={label}
      onClick={onClick}
      className={`min-h-9 min-w-[4.25rem] rounded-md px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide motion-safe:transition-colors sm:text-xs ${r} ${
        pressed
          ? isSidebar
            ? 'bg-sidebar-active-bg text-sidebar-on-active shadow-sm'
            : 'bg-primary-container text-on-primary-container shadow-sm'
          : isSidebar
            ? 'text-sidebar-on hover:bg-sidebar hover:text-sidebar-on-active'
            : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
      }`}
    >
      {children}
    </button>
  )
}
