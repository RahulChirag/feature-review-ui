import { useEffect, useState } from 'react'
import { getFeatureDocumentById } from '../lib/featureRepository'

/**
 * @param {string | null} activeId
 */
export function useFeatureDocument(activeId) {
  const [docStatus, setDocStatus] = useState('idle')
  const [docContent, setDocContent] = useState(null)

  useEffect(() => {
    if (!activeId) return

    setDocContent(null)
    setDocStatus('loading')

    let cancelled = false

    getFeatureDocumentById(activeId)
      .then((content) => {
        if (cancelled) return
        setDocContent(content || null)
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
    docStatus,
    canDownloadDoc: docStatus === 'ready' && !!docContent,
  }
}
