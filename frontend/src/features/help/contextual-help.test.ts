import { describe, expect, it } from 'vitest'
import {
  getContextualHelpTopics,
  getContextualTopicIds,
} from './contextual-help'

describe('contextual help', () => {
  it('returns upload guidance for GL ingestion routes', () => {
    expect(getContextualTopicIds('/ingestion')).toEqual([
      'upload-a-spreadsheet',
      'what-files-do-i-need',
      'fix-upload-problems',
    ])
  })

  it('returns reconciliation review guidance for reconciliation routes', () => {
    const topics = getContextualHelpTopics(
      '/properties/property-1/reconciliations?year=2025'
    )

    expect(topics.map((topic) => topic.id)).toContain('review-findings')
    expect(topics.map((topic) => topic.id)).toContain('finalize-reconciliation')
  })
})
