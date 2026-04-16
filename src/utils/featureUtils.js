import { getAllFeatures, getFeatureDocumentById } from '../features/feature-reviews/lib/featureRepository'

export const features = getAllFeatures()
export const loadFeatureDoc = getFeatureDocumentById

export { formatFeatureName, formatGeneratedDateForDisplay } from '../features/feature-reviews/lib/featureFormatters'
export {
  compareFeaturesByGeneratedDate,
  filterFeatures,
  findFeatureById,
  parseGeneratedDate,
} from '../features/feature-reviews/lib/featureSelectors'
