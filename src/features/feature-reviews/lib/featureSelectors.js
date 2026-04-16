import { formatFeatureName } from './featureFormatters'

/**
 * @param {Record<string, unknown> | undefined} meta
 * @returns {number | null}
 */
export function parseGeneratedDate(meta) {
  const raw = meta?.generated_date
  if (raw == null || raw === '') return null

  const timestamp = Date.parse(String(raw))
  return Number.isNaN(timestamp) ? null : timestamp
}

export function compareFeaturesByGeneratedDate(a, b) {
  const aTimestamp = parseGeneratedDate(a.meta)
  const bTimestamp = parseGeneratedDate(b.meta)

  if (aTimestamp !== null && bTimestamp !== null) {
    if (bTimestamp !== aTimestamp) return bTimestamp - aTimestamp
    return a.id.localeCompare(b.id)
  }

  if (aTimestamp !== null && bTimestamp === null) return -1
  if (aTimestamp === null && bTimestamp !== null) return 1
  return a.id.localeCompare(b.id)
}

export function filterFeatures(features, query) {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return features

  return features.filter((feature) => {
    const label = formatFeatureName(feature.meta?.feature ?? feature.id).toLowerCase()
    const id = feature.id.toLowerCase()
    return label.includes(normalizedQuery) || id.includes(normalizedQuery)
  })
}

export function findFeatureById(features, activeId) {
  return features.find((feature) => feature.id === activeId) ?? null
}
