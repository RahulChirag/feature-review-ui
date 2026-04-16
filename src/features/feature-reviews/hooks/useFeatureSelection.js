import { useMemo, useState } from 'react'
import { getAllFeatures } from '../lib/featureRepository'
import { filterFeatures, findFeatureById } from '../lib/featureSelectors'

const features = getAllFeatures()

export function useFeatureSelection() {
  const [activeId, setActiveId] = useState(features[0]?.id ?? null)
  const [tab, setTab] = useState('doc')
  const [featureQuery, setFeatureQuery] = useState('')

  const filteredFeatures = useMemo(() => filterFeatures(features, featureQuery), [featureQuery])
  const feature = useMemo(() => findFeatureById(features, activeId), [activeId])

  function selectFeature(id) {
    setActiveId(id)
    setTab('doc')
  }

  return {
    activeId,
    feature,
    featureQuery,
    filteredFeatures,
    selectFeature,
    setFeatureQuery,
    setTab,
    tab,
    totalFeatures: features.length,
  }
}
