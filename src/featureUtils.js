export function formatFeatureName(str) {
  return str
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
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
