import { describe, it, expect } from 'vitest'
import {
  QUIZ_QUESTIONS,
  computeScore,
  getTier,
  getTopVulnerabilities,
  VULNERABILITY_MAP,
} from './quiz-data'

describe('QUIZ_QUESTIONS', () => {
  it('has exactly 10 questions', () => {
    expect(QUIZ_QUESTIONS).toHaveLength(10)
  })

  it('each question has exactly 3 answer choices', () => {
    QUIZ_QUESTIONS.forEach((q) => {
      expect(q.answers).toHaveLength(3)
    })
  })

  it('answer points are always 0, 5, or 10', () => {
    QUIZ_QUESTIONS.forEach((q) => {
      const points = q.answers.map((a) => a.points)
      points.forEach((p) => expect([0, 5, 10]).toContain(p))
    })
  })

  it('each question has a unique id 1–10', () => {
    const ids = QUIZ_QUESTIONS.map((q) => q.id)
    expect(ids).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })
})

describe('computeScore', () => {
  it('returns 0 when all answers are 0', () => {
    const answers = QUIZ_QUESTIONS.map(() => 0)
    expect(computeScore(answers)).toBe(0)
  })

  it('returns 100 when all answers are 10', () => {
    const answers = QUIZ_QUESTIONS.map(() => 10)
    expect(computeScore(answers)).toBe(100)
  })

  it('returns 50 when all answers are 5', () => {
    const answers = QUIZ_QUESTIONS.map(() => 5)
    expect(computeScore(answers)).toBe(50)
  })

  it('returns sum of provided answers', () => {
    const answers = [10, 10, 10, 0, 0, 0, 0, 0, 0, 0]
    expect(computeScore(answers)).toBe(30)
  })
})

describe('getTier', () => {
  it('returns Low Risk for score 0', () => {
    expect(getTier(0).label).toBe('Low Risk')
  })

  it('returns Low Risk for score 30', () => {
    expect(getTier(30).label).toBe('Low Risk')
  })

  it('returns Moderate Risk for score 31', () => {
    expect(getTier(31).label).toBe('Moderate Risk')
  })

  it('returns Moderate Risk for score 65', () => {
    expect(getTier(65).label).toBe('Moderate Risk')
  })

  it('returns High Risk for score 66', () => {
    expect(getTier(66).label).toBe('High Risk')
  })

  it('returns High Risk for score 100', () => {
    expect(getTier(100).label).toBe('High Risk')
  })
})

describe('getTopVulnerabilities', () => {
  it('returns exactly 3 vulnerabilities', () => {
    const answers = [10, 10, 10, 10, 10, 10, 10, 10, 10, 10]
    expect(getTopVulnerabilities(answers)).toHaveLength(3)
  })

  it('returns vulnerability labels for the 3 highest-scored questions', () => {
    const answers = [10, 0, 10, 0, 10, 0, 0, 0, 0, 0]
    const vulns = getTopVulnerabilities(answers)
    expect(vulns).toHaveLength(3)
    vulns.forEach((v) => expect(typeof v).toBe('string'))
  })

  it('returns unique vulnerability labels (deduped by label)', () => {
    const answers = [10, 10, 10, 10, 10, 10, 10, 10, 10, 10]
    const vulns = getTopVulnerabilities(answers)
    const unique = new Set(vulns)
    expect(unique.size).toBe(3)
  })
})

describe('VULNERABILITY_MAP', () => {
  it('contains at least 3 entries', () => {
    expect(Object.keys(VULNERABILITY_MAP).length).toBeGreaterThanOrEqual(3)
  })
})
