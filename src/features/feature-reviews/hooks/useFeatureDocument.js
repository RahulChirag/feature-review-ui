import { useEffect, useState } from 'react'
import { getFeatureDocumentById } from '../lib/featureRepository'

/**
 * @param {string | null} activeId
 */
export function useFeatureDocument(activeId) {
  const [docStatus, setDocStatus] = useState('idle')
  const [docContent, setDocContent] = useState(null)
  const [docType, setDocType] = useState(null)

  useEffect(() => {
    if (!activeId) return

    setDocContent(null)
    setDocType(null)
    setDocStatus('loading')

    let cancelled = false

    getFeatureDocumentById(activeId)
      .then((doc) => {
        if (cancelled) return
        setDocType(doc?.type ?? null)
        setDocContent(doc?.content || null)
        setDocStatus('ready')
      })
      .catch(() => {
        if (cancelled) return
        setDocStatus('error')
      })

    return () => {
      cancelled = true
    }
  }, [activeId])

  return {
    docContent,
    docType,
    docStatus,
    canDownloadDoc: docStatus === 'ready' && !!docContent,
  }
}
