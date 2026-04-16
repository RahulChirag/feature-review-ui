import { compareFeaturesByGeneratedDate } from './featureSelectors'

const mdLoaders = import.meta.glob('../../../../feature-reviews/**/*.md', {
  query: '?raw',
  import: 'default',
  eager: false,
})

const pdfLoaders = import.meta.glob('../../../../feature-reviews/**/*.pdf', {
  query: '?url',
  import: 'default',
  eager: false,
})

const metaModules = import.meta.glob('../../../../feature-reviews/**/meta.json', {
  eager: true,
})

const docCache = new Map()

function getFeatureFolder(path) {
  return path.split('/').at(-2)
}

function buildFeatureIndex() {
  const featureMap = {}

  Object.keys(mdLoaders).forEach((path) => {
    const folder = getFeatureFolder(path)
    if (!featureMap[folder]) featureMap[folder] = { id: folder }
    featureMap[folder].hasDoc = true
    featureMap[folder].hasMarkdown = true
  })

  Object.keys(pdfLoaders).forEach((path) => {
    const folder = getFeatureFolder(path)
    if (!featureMap[folder]) featureMap[folder] = { id: folder }
    featureMap[folder].hasDoc = true
    featureMap[folder].hasPdf = true
  })

  Object.entries(metaModules).forEach(([path, module]) => {
    const folder = getFeatureFolder(path)
    if (!featureMap[folder]) featureMap[folder] = { id: folder, hasDoc: false }
    featureMap[folder].meta = module.default ?? module
  })

  return Object.values(featureMap)
    .map((f) => ({
      ...f,
      /** Sidebar grouping: markdown wins when both exist (same as getFeatureDocumentById). */
      docKind: f.hasMarkdown ? 'markdown' : f.hasPdf ? 'pdf' : 'none',
    }))
    .sort(compareFeaturesByGeneratedDate)
}

const featureIndex = buildFeatureIndex()

export function getAllFeatures() {
  return featureIndex
}

export async function getFeatureDocumentById(id) {
  if (docCache.has(id)) return docCache.get(id)

  const markdownLoaderEntry = Object.entries(mdLoaders).find(([path]) => getFeatureFolder(path) === id)
  if (markdownLoaderEntry) {
    const content = await markdownLoaderEntry[1]()
    const doc = { type: 'markdown', content }
    docCache.set(id, doc)
    return doc
  }

  const pdfLoaderEntry = Object.entries(pdfLoaders).find(([path]) => getFeatureFolder(path) === id)
  if (pdfLoaderEntry) {
    const content = await pdfLoaderEntry[1]()
    const doc = { type: 'pdf', content }
    docCache.set(id, doc)
    return doc
  }

  return null
}
