/**
 * User domain types for authentication and authorization.
 *
 * These Zod schemas match exactly with backend/app/models/user.py.
 * Users are linked to organizations and have roles that determine
 * their permissions within the system.
 */

import { z } from 'zod'

import { UserRole } from './enums'

/**
 * Schema for UserRole enum validation.
 * Must match the backend UserRole enum values.
 */
export const UserRoleSchema = z.enum(['owner', 'admin', 'member', 'viewer'])

/**
 * Full user model from database.
 *
 * The id field matches auth.users.id from Supabase Auth,
 * enabling seamless integration with the authentication system.
 */
export const UserSchema = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  email: z.string().email(),
  full_name: z.string().max(255).nullable(),
  role: UserRoleSchema,
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
})

export type User = z.infer<typeof UserSchema>

/**
 * DTO for creating a user.
 *
 * Requires organization_id since users cannot exist without
 * being linked to an organization.
 */
export const UserCreateSchema = z.object({
  email: z.string().email(),
  full_name: z.string().max(255).optional(),
  role: UserRoleSchema.default('member'),
  organization_id: z.string().uuid(),
})

export type UserCreate = z.infer<typeof UserCreateSchema>

/**
 * DTO for updating a user (all fields optional).
 *
 * Email cannot be updated through this DTO - that requires
 * a separate verification flow through Supabase Auth.
 */
export const UserUpdateSchema = z.object({
  full_name: z.string().max(255).optional(),
  role: UserRoleSchema.optional(),
})

export type UserUpdate = z.infer<typeof UserUpdateSchema>

/**
 * User with organization details for context.
 *
 * Used in API responses where organization context is needed
 * without a separate query.
 */
export const UserWithOrgSchema = UserSchema.extend({
  organization_name: z.string(),
})

export type UserWithOrg = z.infer<typeof UserWithOrgSchema>

/**
 * Helper to validate UserRole values match the const object
 */
export const isValidUserRole = (role: string): role is UserRole => {
  return Object.values(UserRole).includes(role as UserRole)
}
