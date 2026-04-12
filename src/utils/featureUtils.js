// Markdown: non-eager — each entry is a loader fn, content is not in the bundle
const mdLoaders = import.meta.glob('../../feature-reviews/**/*.md', {
  query: '?raw',
  import: 'default',
  eager: false,
})

// Meta JSON: eager — small files, needed immediately for filtering/sorting/headers
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

  // Register all folders that have a markdown file (no content yet)
  Object.keys(mdLoaders).forEach((path) => {
    const folder = path.split('/').at(-2)
    if (!map[folder]) map[folder] = { id: folder }
    map[folder].hasDoc = true
  })

  // Register all folders that have meta.json (with content)
  Object.entries(metaModules).forEach(([path, mod]) => {
    const folder = path.split('/').at(-2)
    if (!map[folder]) map[folder] = { id: folder, hasDoc: false }
    map[folder].meta = mod.default ?? mod
  })

  return Object.values(map).sort(compareFeaturesByGeneratedDate)
}

export const features = buildFeatures()

/** Cache so revisiting a feature does not re-fetch. */
const docCache = new Map()

/**
 * Dynamically loads the raw markdown for a feature by id.
 * Returns '' if the feature has no markdown file.
 * Results are cached in memory for the session.
 */
export async function loadFeatureDoc(id) {
  if (docCache.has(id)) return docCache.get(id)

  const loaderEntry = Object.entries(mdLoaders).find(
    ([path]) => path.split('/').at(-2) === id
  )
  if (!loaderEntry) return ''

  const content = await loaderEntry[1]()
  docCache.set(id, content)
  return content
}

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
 * @returns {{ iso: string, label: string }}
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
