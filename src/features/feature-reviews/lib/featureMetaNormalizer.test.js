import { describe, expect, it } from 'vitest'
import { normalizeFeatureMeta } from './featureMetaNormalizer'

describe('normalizeFeatureMeta', () => {
  it('normalizes alias fields and merges files list keys', () => {
    const normalized = normalizeFeatureMeta({
      title: 'IDP Sync',
      analyzed_date: '2026-04-20',
      files_analyzed: ['a.js'],
      files_referenced: ['b.js'],
      entry_points: ['src/main.js -> run()'],
      apis_used: { internal: ['/api/internal'], external: ['https://example.com'] },
      db_operations: ['Model SELECT in file.js'],
      functions_traced: ['fn in file.js'],
    })

    expect(normalized.title).toBe('IDP Sync')
    expect(normalized.generatedAt).toBe('2026-04-20')
    expect(normalized.files).toEqual(['a.js', 'b.js'])
    expect(normalized.apisUsed.total.length).toBe(2)
  })

  it('retains unknown fields as extra sections', () => {
    const normalized = normalizeFeatureMeta({
      feature: 'Sharepoint',
      generated_date: '2026-04-18',
      custom_metric: 12,
      nested_block: { risk: 'high' },
    })

    const keys = normalized.extraSections.map((section) => section.key)
    expect(keys).toContain('custom_metric')
    expect(keys).toContain('nested_block')
  })
})
