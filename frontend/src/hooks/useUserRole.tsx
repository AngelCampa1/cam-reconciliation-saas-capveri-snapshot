/**
 * useUserRole Hook
 *
 * Provides role-checking helper functions for authorization.
 * Wraps useAuth() to provide convenient role-based permissions.
 *
 * @example
 * ```tsx
 * const { isAdmin, canEdit, canDelete } = useUserRole()
 *
 * if (canEdit) {
 *   return <EditButton />
 * }
 * ```
 */
import { useMemo } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { UserRole, type UserRole as UserRoleType } from '@/types/enums'

export function useUserRole() {
  const { userRole, isAdmin, isOwner } = useAuth()

  /**
   * Check if user has a specific role
   */
  const hasRole = (role: UserRoleType): boolean => {
    return userRole === role
  }

  /**
   * Check if user has any of the specified roles
   */
  const hasAnyRole = (roles: UserRoleType[]): boolean => {
    return userRole ? roles.includes(userRole) : false
  }

  /**
   * Check if user can edit resources
   * OWNER, ADMIN, and MEMBER can edit
   */
  const canEdit = useMemo((): boolean => {
    return userRole
      ? (
          [
            UserRole.OWNER,
            UserRole.ADMIN,
            UserRole.MEMBER,
          ] as readonly (typeof userRole)[]
        ).includes(userRole)
      : false
  }, [userRole])

  /**
   * Check if user can delete resources
   * Only OWNER and ADMIN can delete
   */
  const canDelete = useMemo((): boolean => {
    return userRole
      ? (
          [UserRole.OWNER, UserRole.ADMIN] as readonly (typeof userRole)[]
        ).includes(userRole)
      : false
  }, [userRole])

  /**
   * Check if user can manage other users
   * Only OWNER and ADMIN can manage users
   */
  const canManageUsers = useMemo((): boolean => {
    return isAdmin
  }, [isAdmin])

  /**
   * Check if user is read-only (VIEWER role)
   */
  const isReadOnly = useMemo((): boolean => {
    return userRole === UserRole.VIEWER
  }, [userRole])

  return {
    userRole,
    isAdmin,
    isOwner,
    hasRole,
    hasAnyRole,
    canEdit,
    canDelete,
    canManageUsers,
    isReadOnly,
  }
}
