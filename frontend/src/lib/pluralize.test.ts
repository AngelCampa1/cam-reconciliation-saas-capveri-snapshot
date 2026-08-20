import { describe, expect, it } from 'vitest'

import { pluralize, pluralizeWithCount } from './pluralize'

describe('pluralize', () => {
  it('returns the singular form only for a count of exactly 1', () => {
    expect(pluralize(1, 'item')).toBe('item')
  })

  it('returns the regular -s plural for counts other than 1', () => {
    expect(pluralize(0, 'item')).toBe('items')
    expect(pluralize(2, 'item')).toBe('items')
    expect(pluralize(8432, 'tenant')).toBe('tenants')
  })

  it('treats 0 and negative counts as plural (English usage)', () => {
    expect(pluralize(0, 'day')).toBe('days')
    expect(pluralize(-1, 'day')).toBe('days')
  })

  it('uses an explicit irregular plural when provided', () => {
    expect(pluralize(1, 'person', 'people')).toBe('person')
    expect(pluralize(3, 'person', 'people')).toBe('people')
  })
})

describe('pluralizeWithCount', () => {
  it('prefixes the count and pluralizes the noun to match', () => {
    expect(pluralizeWithCount(1, 'row')).toBe('1 row')
    expect(pluralizeWithCount(2, 'row')).toBe('2 rows')
  })

  it('formats large counts with locale thousands separators', () => {
    expect(pluralizeWithCount(8432, 'row')).toBe('8,432 rows')
    expect(pluralizeWithCount(1000000, 'unit')).toBe('1,000,000 units')
  })

  it('honors an irregular plural', () => {
    expect(pluralizeWithCount(1, 'person', 'people')).toBe('1 person')
    expect(pluralizeWithCount(5, 'person', 'people')).toBe('5 people')
  })

  it('treats a negative count as plural', () => {
    expect(pluralizeWithCount(-3, 'day')).toBe('-3 days')
  })
})
