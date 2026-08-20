import { describe, it, expect } from 'vitest'

import { snakeToTitleCase } from './title-case'

describe('snakeToTitleCase', () => {
  it('converts snake_case to Title Case', () => {
    expect(snakeToTitleCase('non_cumulative')).toBe('Non Cumulative')
    expect(snakeToTitleCase('property_manager')).toBe('Property Manager')
  })

  it('capitalizes a single bare word', () => {
    expect(snakeToTitleCase('landlord')).toBe('Landlord')
  })

  it('preserves already-uppercase letters within a word', () => {
    expect(snakeToTitleCase('FOO_bar')).toBe('FOO Bar')
  })

  it('returns an empty string unchanged', () => {
    expect(snakeToTitleCase('')).toBe('')
  })
})
