import { compareFeaturesByGeneratedDate } from './featureSelectors'

const mdLoaders = import.meta.glob('../../../../feature-reviews/**/*.md', {
  query: '?raw',
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
  })

  Object.entries(metaModules).forEach(([path, module]) => {
    const folder = getFeatureFolder(path)
    if (!featureMap[folder]) featureMap[folder] = { id: folder, hasDoc: false }
    featureMap[folder].meta = module.default ?? module
  })

  return Object.values(featureMap).sort(compareFeaturesByGeneratedDate)
}

const featureIndex = buildFeatureIndex()

export function getAllFeatures() {
  return featureIndex
}

export async function getFeatureDocumentById(id) {
  if (docCache.has(id)) return docCache.get(id)

  const loaderEntry = Object.entries(mdLoaders).find(([path]) => getFeatureFolder(path) === id)
  if (!loaderEntry) return ''

  const content = await loaderEntry[1]()
  docCache.set(id, content)
  return content
}
