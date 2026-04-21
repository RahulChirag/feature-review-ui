import { compareFeaturesByGeneratedDate } from './featureSelectors'
import { normalizeFeatureMeta } from './featureMetaNormalizer'

const mdLoaders = import.meta.glob('../../../../feature-reviews/**/*.{md,MD,markdown,MARKDOWN}', {
  query: '?raw',
  import: 'default',
  eager: false,
})

const pdfLoaders = import.meta.glob('../../../../feature-reviews/**/*.{pdf,PDF}', {
  query: '?url',
  import: 'default',
  eager: false,
})

const metaModules = import.meta.glob('../../../../feature-reviews/**/{meta.json,Meta.json,META.json}', {
  eager: true,
})

const docCache = new Map()

function getFeatureFolder(path) {
  return path.split('/').at(-2)
}

function getFileName(path) {
  return path.split('/').at(-1) ?? ''
}

function getDocKind(hasMarkdown, hasPdf, hasMeta, hasIssues) {
  if (hasIssues) return 'invalid'
  if (hasMarkdown) return 'markdown'
  if (hasPdf) return 'pdf'
  if (hasMeta) return 'none'
  return 'none'
}

function buildFeatureIndex() {
  const featureMap = new Map()

  function getOrCreateFeature(id) {
    if (!featureMap.has(id)) {
      featureMap.set(id, {
        id,
        markdownPaths: [],
        pdfPaths: [],
        issues: [],
        hasMeta: false,
      })
    }
    return featureMap.get(id)
  }

  Object.keys(mdLoaders).forEach((path) => {
    const folder = getFeatureFolder(path)
    const feature = getOrCreateFeature(folder)
    feature.markdownPaths.push(path)
  })

  Object.keys(pdfLoaders).forEach((path) => {
    const folder = getFeatureFolder(path)
    const feature = getOrCreateFeature(folder)
    feature.pdfPaths.push(path)
  })

  Object.entries(metaModules).forEach(([path, module]) => {
    const folder = getFeatureFolder(path)
    const feature = getOrCreateFeature(folder)
    feature.hasMeta = true
    if (getFileName(path) !== 'meta.json') {
      feature.issues.push(`Non-canonical metadata filename: ${getFileName(path)}`)
    }
    feature.meta = module.default ?? module
  })

  const normalized = Array.from(featureMap.values()).map((feature) => {
    if (feature.markdownPaths.length > 1) {
      feature.issues.push(`Multiple markdown files found (${feature.markdownPaths.length})`)
    }
    if (feature.pdfPaths.length > 1) {
      feature.issues.push(`Multiple PDF files found (${feature.pdfPaths.length})`)
    }
    if (feature.markdownPaths.length > 0 && feature.pdfPaths.length > 0) {
      feature.issues.push('Both markdown and PDF files present; markdown will be preferred.')
    }

    const primaryMarkdownPath = feature.markdownPaths.slice().sort((a, b) => a.localeCompare(b))[0]
    const primaryPdfPath = feature.pdfPaths.slice().sort((a, b) => a.localeCompare(b))[0]
    const hasMarkdown = Boolean(primaryMarkdownPath)
    const hasPdf = Boolean(primaryPdfPath)
    const hasDoc = hasMarkdown || hasPdf
    const hasIssues = feature.issues.length > 0

    return {
      id: feature.id,
      meta: feature.meta,
      normalizedMeta: normalizeFeatureMeta(feature.meta),
      hasDoc,
      hasMeta: feature.hasMeta,
      hasMarkdown,
      hasPdf,
      primaryMarkdownPath,
      primaryPdfPath,
      markdownCount: feature.markdownPaths.length,
      pdfCount: feature.pdfPaths.length,
      issues: feature.issues,
      docKind: getDocKind(hasMarkdown, hasPdf, feature.hasMeta, hasIssues),
    }
  })

  return normalized
    .sort(compareFeaturesByGeneratedDate)
}

const featureIndex = buildFeatureIndex()

export function getAllFeatures() {
  return featureIndex
}

export async function getFeatureDocumentById(id) {
  if (docCache.has(id)) return docCache.get(id)

  const feature = featureIndex.find((entry) => entry.id === id)
  if (!feature) return null

  if (feature.primaryMarkdownPath && mdLoaders[feature.primaryMarkdownPath]) {
    const content = await mdLoaders[feature.primaryMarkdownPath]()
    const doc = { type: 'markdown', content }
    docCache.set(id, doc)
    return doc
  }

  if (feature.primaryPdfPath && pdfLoaders[feature.primaryPdfPath]) {
    const content = await pdfLoaders[feature.primaryPdfPath]()
    const doc = { type: 'pdf', content }
    docCache.set(id, doc)
    return doc
  }

  return null
}
