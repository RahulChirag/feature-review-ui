import { createContext, useContext, useEffect, useMemo, useState } from 'react'

export const THEME_STORAGE_KEY = 'feature-review-ui-theme'

const ThemeContext = createContext(null)

export function ThemeProvider({ children }) {
  const [preference, setPreferenceState] = useState(() => {
    if (typeof window === 'undefined') return 'system'
    return localStorage.getItem(THEME_STORAGE_KEY) || 'system'
  })

  const [systemDark, setSystemDark] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)').matches : false
  )

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setSystemDark(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const resolvedTheme = useMemo(() => {
    if (preference === 'dark') return 'dark'
    if (preference === 'light') return 'light'
    return systemDark ? 'dark' : 'light'
  }, [preference, systemDark])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolvedTheme === 'dark')
  }, [resolvedTheme])

  const setPreference = (p) => {
    setPreferenceState(p)
    try {
      localStorage.setItem(THEME_STORAGE_KEY, p)
    } catch {
      /* ignore */
    }
  }

  const value = useMemo(
    () => ({ preference, setPreference, resolvedTheme }),
    [preference, resolvedTheme]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider')
  }
  return ctx
}
