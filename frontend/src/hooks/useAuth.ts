/**
 * Authentication Hook
 *
 * Re-exports useAuth from AuthContext for backward compatibility.
 * All authentication logic is now centralized in AuthContext.
 *
 * Components can continue to import from this file:
 * ```tsx
 * import { useAuth } from '../hooks/useAuth'
 * ```
 *
 * The authentication state is now provided via React Context,
 * ensuring a single source of truth across the application.
 */
export { useAuth, AuthProvider } from '../contexts/AuthContext'
export type { AuthSession } from '../api/client'
