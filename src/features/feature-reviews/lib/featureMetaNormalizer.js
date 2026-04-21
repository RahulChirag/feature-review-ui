function asRecord(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value
  return {}
}

function asStringArray(value) {
  if (!Array.isArray(value)) return []
  return value.map((item) => String(item)).filter(Boolean)
}

function firstNonEmptyString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

function pickFirstValue(meta, keys) {
  for (const key of keys) {
    if (meta[key] != null && meta[key] !== '') return meta[key]
  }
  return null
}

function labelizeKey(key) {
  return key
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (char) => char.toUpperCase())
}

function normalizeApisUsed(value) {
  if (Array.isArray(value)) {
    return { internal: [], external: asStringArray(value), total: asStringArray(value) }
  }
  if (value && typeof value === 'object') {
    const internal = asStringArray(value.internal)
    const external = asStringArray(value.external)
    return { internal, external, total: [...internal, ...external] }
  }
  return { internal: [], external: [], total: [] }
}

function toExtraItems(value) {
  if (Array.isArray(value)) return value.map((item) => String(item))
  if (value && typeof value === 'object') {
    return Object.entries(value).map(([key, item]) => `${labelizeKey(key)}: ${JSON.stringify(item)}`)
  }
  if (value == null || value === '') return []
  return [String(value)]
}

const KNOWN_KEYS = new Set([
  'feature',
  'title',
  'name',
  'description',
  'generated_date',
  'analyzed_date',
  'generatedAt',
  'entry_points',
  'files_involved',
  'files_analyzed',
  'files_referenced',
  'apis_used',
  'db_operations',
  'functions_traced',
])

export function normalizeFeatureMeta(rawMeta) {
  const meta = asRecord(rawMeta)
  const warnings = []

  const title = firstNonEmptyString(meta.feature, meta.title, meta.name)
  if (!title) warnings.push('Missing title-like field (feature/title/name).')

  const dateRaw = pickFirstValue(meta, ['generated_date', 'analyzed_date', 'generatedAt'])
  if (dateRaw == null) warnings.push('Missing date-like field (generated_date/analyzed_date/generatedAt).')

  const files = [
    ...asStringArray(meta.files_involved),
    ...asStringArray(meta.files_analyzed),
    ...asStringArray(meta.files_referenced),
  ]
  const apis = normalizeApisUsed(meta.apis_used)
  const entryPoints = asStringArray(meta.entry_points)
  const dbOperations = asStringArray(meta.db_operations)
  const functionsTraced = asStringArray(meta.functions_traced)

  const knownSections = [
    { key: 'entry_points', label: 'Entry Points', items: entryPoints },
    { key: 'files', label: 'Files', items: files },
    { key: 'apis_used', label: 'External APIs', items: apis.total },
    { key: 'db_operations', label: 'DB Operations', items: dbOperations },
    { key: 'functions_traced', label: 'Functions', items: functionsTraced },
  ]

  const extraSections = Object.entries(meta)
    .filter(([key]) => !KNOWN_KEYS.has(key))
    .map(([key, value]) => ({
      key,
      label: labelizeKey(key),
      items: toExtraItems(value),
      raw: value,
    }))
    .filter((section) => section.items.length > 0)
    .sort((a, b) => a.label.localeCompare(b.label))

  return {
    raw: meta,
    title,
    description: firstNonEmptyString(meta.description, meta.summary),
    generatedAt: dateRaw ? String(dateRaw) : '',
    files,
    entryPoints,
    dbOperations,
    functionsTraced,
    apisUsed: apis,
    knownSections,
    extraSections,
    warnings,
  }
}
