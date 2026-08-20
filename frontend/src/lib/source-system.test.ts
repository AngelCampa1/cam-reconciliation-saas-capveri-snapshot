import { describe, it, expect } from 'vitest'
import {
  SOURCE_LABELS,
  SOURCE_DESCRIPTIONS,
  getSourceLabel,
} from './source-system'

describe('source-system', () => {
  it('maps each GL source enum to its friendly label', () => {
    expect(SOURCE_LABELS.yardi).toBe('Yardi Voyager')
    expect(SOURCE_LABELS.mri).toBe('MRI Commercial')
    expect(SOURCE_LABELS.generic).toBe('Generic Format')
  })

  it('provides a description for each GL source enum', () => {
    expect(SOURCE_DESCRIPTIONS.yardi).toBe(
      'Yardi Voyager General Ledger export'
    )
    expect(SOURCE_DESCRIPTIONS.mri).toBe('MRI Commercial Rent Roll export')
    expect(SOURCE_DESCRIPTIONS.generic).toBe(
      'Generic CSV/Excel format (requires manual mapping)'
    )
  })

  it('getSourceLabel resolves known enums to their label', () => {
    expect(getSourceLabel('yardi')).toBe('Yardi Voyager')
    expect(getSourceLabel('mri')).toBe('MRI Commercial')
    expect(getSourceLabel('generic')).toBe('Generic Format')
  })

  it('getSourceLabel falls back to the raw value for unknown enums', () => {
    expect(getSourceLabel('sap')).toBe('sap')
    expect(getSourceLabel('')).toBe('')
  })
})
