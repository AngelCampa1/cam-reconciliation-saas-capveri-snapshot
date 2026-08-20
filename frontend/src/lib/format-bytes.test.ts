import { describe, it, expect } from 'vitest'
import { formatFileSize } from './format-bytes'

describe('formatFileSize', () => {
  it('formats sub-kilobyte sizes as whole bytes', () => {
    expect(formatFileSize(0)).toBe('0 B')
    expect(formatFileSize(1)).toBe('1 B')
    expect(formatFileSize(1023)).toBe('1023 B')
  })

  it('formats kilobyte-range sizes with one decimal', () => {
    expect(formatFileSize(1024)).toBe('1.0 KB')
    expect(formatFileSize(1536)).toBe('1.5 KB')
    expect(formatFileSize(1024 * 1024 - 1)).toBe('1024.0 KB')
  })

  it('formats megabyte-range sizes with one decimal', () => {
    expect(formatFileSize(1024 * 1024)).toBe('1.0 MB')
    expect(formatFileSize(1024 * 1024 * 2.5)).toBe('2.5 MB')
    expect(formatFileSize(1024 * 1024 * 1024)).toBe('1024.0 MB')
  })
})
