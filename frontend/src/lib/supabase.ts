/**
 * Supabase Client Configuration
 *
 * Provides a configured Supabase client for authentication and data operations.
 */
import { createClient } from '@supabase/supabase-js'

// Supabase configuration from environment variables
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || ''
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn(
    'Missing Supabase configuration. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY environment variables.'
  )
}

/**
 * Supabase client instance.
 * Pre-configured with project URL and anonymous key.
 *
 * Configuration:
 * - persistSession: true - Sessions persist across page reloads
 * - autoRefreshToken: true - Automatically refresh before expiry
 * - detectSessionInUrl: true - Handle OAuth callbacks
 */
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
