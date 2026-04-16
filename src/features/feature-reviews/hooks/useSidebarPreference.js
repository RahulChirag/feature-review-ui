import { useEffect, useState } from 'react'

const DESKTOP_SIDEBAR_STORAGE_KEY = 'feature-review-ui.desktopSidebarOpen'

function readStoredDesktopSidebarOpen() {
  if (typeof window === 'undefined') return true

  try {
    const value = window.localStorage.getItem(DESKTOP_SIDEBAR_STORAGE_KEY)
    if (value === null) return true
    return value === 'true'
  } catch {
    return true
  }
}

export function useSidebarPreference() {
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(readStoredDesktopSidebarOpen)

  useEffect(() => {
    try {
      window.localStorage.setItem(DESKTOP_SIDEBAR_STORAGE_KEY, String(desktopSidebarOpen))
    } catch {
      /* ignore quota / private mode */
    }
  }, [desktopSidebarOpen])

  return {
    desktopSidebarOpen,
    setDesktopSidebarOpen,
  }
}
