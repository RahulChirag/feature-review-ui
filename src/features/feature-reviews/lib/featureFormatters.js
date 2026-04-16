export function formatFeatureName(str) {
  return str
    .split(/[-_]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

/**
 * @param {unknown} raw
 * @returns {{ iso: string, label: string }}
 */
export function formatGeneratedDateForDisplay(raw) {
  if (raw == null || raw === '') return { iso: '', label: '' }

  const value = String(raw)
  const timestamp = Date.parse(value)

  if (Number.isNaN(timestamp)) {
    return { iso: '', label: value }
  }

  const date = new Date(timestamp)

  return {
    iso: date.toISOString().slice(0, 10),
    label: new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date),
  }
}
