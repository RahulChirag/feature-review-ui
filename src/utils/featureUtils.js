const mdModules = import.meta.glob('../../feature-reviews/**/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
})
const metaModules = import.meta.glob('../../feature-reviews/**/meta.json', {
  eager: true,
})

function compareFeaturesByGeneratedDate(a, b) {
  const ta = parseGeneratedDate(a.meta)
  const tb = parseGeneratedDate(b.meta)
  if (ta !== null && tb !== null) {
    if (tb !== ta) return tb - ta
    return a.id.localeCompare(b.id)
  }
  if (ta !== null && tb === null) return -1
  if (ta === null && tb !== null) return 1
  return a.id.localeCompare(b.id)
}

function buildFeatures() {
  const map = {}

  Object.entries(mdModules).forEach(([path, content]) => {
    const folder = path.split('/').at(-2)
    if (!map[folder]) map[folder] = { id: folder }
    map[folder].doc = content
  })

  Object.entries(metaModules).forEach(([path, mod]) => {
    const folder = path.split('/').at(-2)
    if (!map[folder]) map[folder] = { id: folder }
    map[folder].meta = mod.default ?? mod
  })

  return Object.values(map).sort(compareFeaturesByGeneratedDate)
}

export const features = buildFeatures()

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
 * Machine + human labels for <time dateTime> and display.
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
