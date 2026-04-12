export function formatFeatureName(str) {
  return str
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

/** @returns {number | null} epoch ms for sorting, or null if missing/invalid */
export function parseGeneratedDate(meta) {
  const raw = meta?.generated_date
  if (raw == null || raw === '') return null
  const t = Date.parse(String(raw))
  return Number.isNaN(t) ? null : t
}

/**
 * Machine + human labels for &lt;time dateTime&gt; and display.
 * @param {unknown} raw — meta.generated_date
 * @returns {{ iso: string, label: string }} iso is YYYY-MM-DD when parseable; label is locale-medium or raw fallback
 */
export function formatGeneratedDateForDisplay(raw) {
  if (raw == null || raw === '') return { iso: '', label: '' }
  const s = String(raw)
  const t = Date.parse(s)
  if (Number.isNaN(t)) {
    return { iso: '', label: s }
  }
  const d = new Date(t)
  const iso = d.toISOString().slice(0, 10)
  const label = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(d)
  return { iso, label }
}

/**
 * @param {Array<{ id: string, meta?: { feature?: string } }>} features
 * @param {string} query
 */
export function filterFeatures(features, query) {
  const q = query.trim().toLowerCase()
  if (!q) return features
  return features.filter((f) => {
    const label = formatFeatureName(f.meta?.feature ?? f.id).toLowerCase()
    const id = f.id.toLowerCase()
    return label.includes(q) || id.includes(q)
  })
}
