import { afterEach, describe, expect, it, vi } from 'vitest'
import { getBuildMetadata, writeBuildMetadataTag } from './buildMetadata'

describe('build metadata', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    document.head.innerHTML = ''
  })

  it('returns public build metadata from Vite env', () => {
    vi.stubEnv('VITE_APP_VERSION', '0.1.0')
    vi.stubEnv('VITE_BUILD_COMMIT', 'abc123')

    expect(getBuildMetadata()).toEqual({
      app: 'frontend',
      version: '0.1.0',
      commit: 'abc123',
      environment: 'test',
    })
  })

  it('writes a machine-readable build metadata tag', () => {
    vi.stubEnv('VITE_APP_VERSION', '0.1.0')
    vi.stubEnv('VITE_BUILD_COMMIT', 'abc123')

    writeBuildMetadataTag()

    const tag = document.getElementById('capveri-build-metadata')
    expect(tag?.getAttribute('type')).toBe('application/json')
    expect(JSON.parse(tag?.textContent ?? '{}')).toEqual({
      app: 'frontend',
      version: '0.1.0',
      commit: 'abc123',
      environment: 'test',
    })
  })
})
