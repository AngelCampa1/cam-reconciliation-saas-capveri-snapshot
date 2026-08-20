/**
 * Tests for Supabase client configuration.
 *
 * Tests client initialization and environment variable handling.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock console.warn before importing supabase
const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

// Mock createClient before importing supabase
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn((url: string, key: string, options: unknown) => ({
    url,
    key,
    options,
  })),
}))

describe('Supabase Client', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Environment Variables', () => {
    it('warns when VITE_SUPABASE_URL is missing', async () => {
      // Reset modules to re-import with new env
      vi.resetModules()

      // Mock missing URL
      vi.stubEnv('VITE_SUPABASE_URL', '')
      vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-key')

      // Re-import to trigger module execution
      await import('./supabase')

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Missing Supabase configuration. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY environment variables.'
      )
    })

    it('warns when VITE_SUPABASE_ANON_KEY is missing', async () => {
      vi.resetModules()

      vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co')
      vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')

      await import('./supabase')

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Missing Supabase configuration. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY environment variables.'
      )
    })

    it('warns when both environment variables are missing', async () => {
      vi.resetModules()

      vi.stubEnv('VITE_SUPABASE_URL', '')
      vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')

      await import('./supabase')

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Missing Supabase configuration. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY environment variables.'
      )
    })

    it('does not warn when both environment variables are set', async () => {
      vi.resetModules()

      vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co')
      vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key-123')

      await import('./supabase')

      expect(consoleWarnSpy).not.toHaveBeenCalled()
    })
  })

  describe('Client Configuration', () => {
    it('creates client with correct auth options', async () => {
      vi.resetModules()

      vi.stubEnv('VITE_SUPABASE_URL', 'https://project.supabase.co')
      vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key-xyz')

      const { createClient } = await import('@supabase/supabase-js')
      await import('./supabase')

      expect(createClient).toHaveBeenCalledWith(
        'https://project.supabase.co',
        'anon-key-xyz',
        {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
          },
        }
      )
    })
  })
})
