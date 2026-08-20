export interface GlPatternRow {
  pattern: string
  meaning: string
  example: string
}

export const GL_PATTERN_ROWS: GlPatternRow[] = [
  {
    pattern: '4*',
    meaning: 'Prefix match (all starting with 4)',
    example: 'All 4xxx accounts',
  },
  {
    pattern: '41??',
    meaning: 'Single-char wildcards',
    example: '4100 to 4199',
  },
  {
    pattern: '4100-4199',
    meaning: 'Numeric range',
    example: 'Exactly 4100 through 4199',
  },
  {
    pattern: '4100',
    meaning: 'Exact match',
    example: 'Only GL account 4100',
  },
]
