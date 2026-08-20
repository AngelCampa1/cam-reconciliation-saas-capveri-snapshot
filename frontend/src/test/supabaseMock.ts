/**
 * Supabase Mock Utilities for Tests
 *
 * Provides complete Supabase client mock including:
 * - Auth methods (signIn, signOut, etc.)
 * - Database query chains (from, select, eq, etc.)
 * - Configurable responses for different scenarios
 */
import { vi } from 'vitest'
import type { User, Session, AuthError } from '@supabase/supabase-js'

// Export mock functions for test assertions
export const mockSignInWithPassword = vi.fn()
export const mockSignUp = vi.fn()
export const mockSignOut = vi.fn()
export const mockResetPasswordForEmail = vi.fn()
export const mockGetSession = vi.fn()
export const mockRefreshSession = vi.fn()
export const mockOnAuthStateChange = vi.fn()
export const mockSignInWithOAuth = vi.fn()
export const mockSetSession = vi.fn()
export const mockFrom = vi.fn()

/**
 * Create chainable query builder for database operations
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function createQueryBuilder(_tableName: string) {
  const mockSelect = vi.fn()
  const mockEq = vi.fn()
  const mockSingle = vi.fn()
  const mockMaybeSingle = vi.fn()
  const mockInsert = vi.fn()
  const mockUpdate = vi.fn()
  const mockDelete = vi.fn()
  const mockOrder = vi.fn()
  const mockLimit = vi.fn()

  // Default: return null data (user not found scenario)
  mockSingle.mockResolvedValue({ data: null, error: null })
  mockMaybeSingle.mockResolvedValue({ data: null, error: null })

  // Chain methods return the query builder for fluent API
  const chainObject = {
    select: mockSelect,
    eq: mockEq,
    single: mockSingle,
    maybeSingle: mockMaybeSingle,
    insert: mockInsert,
    update: mockUpdate,
    delete: mockDelete,
    order: mockOrder,
    limit: mockLimit,
  }

  mockSelect.mockReturnValue(chainObject)
  mockEq.mockReturnValue(chainObject)
  mockInsert.mockReturnValue(chainObject)
  mockUpdate.mockReturnValue(chainObject)
  mockDelete.mockReturnValue(chainObject)
  mockOrder.mockReturnValue(chainObject)
  mockLimit.mockReturnValue(chainObject)

  return chainObject
}

/**
 * Create complete Supabase mock
 */
export function createSupabaseMock() {
  // Default onAuthStateChange behavior - invokes callback immediately then returns unsubscribe function
  mockOnAuthStateChange.mockImplementation((callback) => {
    // Invoke callback immediately with no session (simulating initial mount)
    // This is critical - the real Supabase onAuthStateChange fires immediately
    callback('INITIAL_SESSION', null)
    return {
      data: {
        subscription: {
          unsubscribe: vi.fn(),
        },
      },
    }
  })

  // Default getSession - no active session
  mockGetSession.mockResolvedValue({ data: { session: null }, error: null })

  // Setup from() to return query builder
  mockFrom.mockImplementation((tableName: string) =>
    createQueryBuilder(tableName)
  )

  return {
    auth: {
      signInWithPassword: mockSignInWithPassword,
      signUp: mockSignUp,
      signOut: mockSignOut,
      resetPasswordForEmail: mockResetPasswordForEmail,
      getSession: mockGetSession,
      refreshSession: mockRefreshSession,
      onAuthStateChange: mockOnAuthStateChange,
      signInWithOAuth: mockSignInWithOAuth,
      setSession: mockSetSession,
    },
    from: mockFrom,
  }
}

/**
 * Reset all mocks to default state
 * Call this in beforeEach
 */
export function resetSupabaseMocks() {
  vi.clearAllMocks()

  // Restore default behaviors
  mockOnAuthStateChange.mockImplementation((callback) => {
    // Invoke callback immediately with no session (simulating initial mount)
    callback('INITIAL_SESSION', null)
    return {
      data: {
        subscription: {
          unsubscribe: vi.fn(),
        },
      },
    }
  })
  mockGetSession.mockResolvedValue({ data: { session: null }, error: null })
  mockFrom.mockImplementation((tableName: string) =>
    createQueryBuilder(tableName)
  )
}

/**
 * Configure user role mock for tests
 * Use this when testing role-specific behavior
 */
export function mockUserRole(
  role: 'owner' | 'admin' | 'user' | 'tenant' | null
) {
  mockFrom.mockImplementation((tableName: string) => {
    if (tableName === 'users') {
      const builder = createQueryBuilder(tableName)
      // Override single() to return the role
      builder.single.mockResolvedValue({
        data: role ? { role } : null,
        error: null,
      })
      return builder
    }
    return createQueryBuilder(tableName)
  })
}

// Test data factories
export const createMockUser = (overrides?: Partial<User>): User => ({
  id: 'test-user-id',
  email: 'test@example.com',
  aud: 'authenticated',
  role: 'authenticated',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  app_metadata: {},
  user_metadata: {},
  ...overrides,
})

export const createMockSession = (overrides?: Partial<Session>): Session => ({
  access_token: 'mock-access-token',
  refresh_token: 'mock-refresh-token',
  expires_at: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
  expires_in: 3600,
  token_type: 'bearer',
  user: createMockUser(),
  ...overrides,
})

export const createMockAuthError = (
  message: string,
  status?: number
): AuthError =>
  ({
    name: 'AuthError',
    message,
    status: status ?? 400,
    code: 'mock_error',
    __isAuthError: true,
  }) as unknown as AuthError
