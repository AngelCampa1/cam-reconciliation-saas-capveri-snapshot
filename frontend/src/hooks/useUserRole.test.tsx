import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useUserRole } from './useUserRole'
import * as AuthContext from '@/contexts/AuthContext'
import { UserRole } from '@/types/enums'

// Mock AuthContext
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}))

describe('useUserRole', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Role Properties', () => {
    it('returns userRole from AuthContext', () => {
      vi.mocked(AuthContext.useAuth).mockReturnValue({
        userRole: UserRole.ADMIN,
        isAdmin: true,
        isOwner: false,
      } as any)

      const { result } = renderHook(() => useUserRole())

      expect(result.current.userRole).toBe(UserRole.ADMIN)
    })

    it('returns isAdmin from AuthContext', () => {
      vi.mocked(AuthContext.useAuth).mockReturnValue({
        userRole: UserRole.OWNER,
        isAdmin: true,
        isOwner: true,
      } as any)

      const { result } = renderHook(() => useUserRole())

      expect(result.current.isAdmin).toBe(true)
    })

    it('returns isOwner from AuthContext', () => {
      vi.mocked(AuthContext.useAuth).mockReturnValue({
        userRole: UserRole.OWNER,
        isAdmin: true,
        isOwner: true,
      } as any)

      const { result } = renderHook(() => useUserRole())

      expect(result.current.isOwner).toBe(true)
    })
  })

  describe('hasRole', () => {
    it('returns true when user has the specified role', () => {
      vi.mocked(AuthContext.useAuth).mockReturnValue({
        userRole: UserRole.ADMIN,
        isAdmin: true,
        isOwner: false,
      } as any)

      const { result } = renderHook(() => useUserRole())

      expect(result.current.hasRole(UserRole.ADMIN)).toBe(true)
    })

    it('returns false when user does not have the specified role', () => {
      vi.mocked(AuthContext.useAuth).mockReturnValue({
        userRole: UserRole.MEMBER,
        isAdmin: false,
        isOwner: false,
      } as any)

      const { result } = renderHook(() => useUserRole())

      expect(result.current.hasRole(UserRole.ADMIN)).toBe(false)
    })

    it('returns false when userRole is null', () => {
      vi.mocked(AuthContext.useAuth).mockReturnValue({
        userRole: null,
        isAdmin: false,
        isOwner: false,
      } as any)

      const { result } = renderHook(() => useUserRole())

      expect(result.current.hasRole(UserRole.ADMIN)).toBe(false)
    })
  })

  describe('hasAnyRole', () => {
    it('returns true when user has one of the specified roles', () => {
      vi.mocked(AuthContext.useAuth).mockReturnValue({
        userRole: UserRole.ADMIN,
        isAdmin: true,
        isOwner: false,
      } as any)

      const { result } = renderHook(() => useUserRole())

      expect(result.current.hasAnyRole([UserRole.OWNER, UserRole.ADMIN])).toBe(
        true
      )
    })

    it('returns false when user has none of the specified roles', () => {
      vi.mocked(AuthContext.useAuth).mockReturnValue({
        userRole: UserRole.VIEWER,
        isAdmin: false,
        isOwner: false,
      } as any)

      const { result } = renderHook(() => useUserRole())

      expect(result.current.hasAnyRole([UserRole.OWNER, UserRole.ADMIN])).toBe(
        false
      )
    })

    it('returns false when userRole is null', () => {
      vi.mocked(AuthContext.useAuth).mockReturnValue({
        userRole: null,
        isAdmin: false,
        isOwner: false,
      } as any)

      const { result } = renderHook(() => useUserRole())

      expect(result.current.hasAnyRole([UserRole.OWNER, UserRole.ADMIN])).toBe(
        false
      )
    })
  })

  describe('canEdit', () => {
    it('returns true for OWNER', () => {
      vi.mocked(AuthContext.useAuth).mockReturnValue({
        userRole: UserRole.OWNER,
        isAdmin: true,
        isOwner: true,
      } as any)

      const { result } = renderHook(() => useUserRole())

      expect(result.current.canEdit).toBe(true)
    })

    it('returns true for ADMIN', () => {
      vi.mocked(AuthContext.useAuth).mockReturnValue({
        userRole: UserRole.ADMIN,
        isAdmin: true,
        isOwner: false,
      } as any)

      const { result } = renderHook(() => useUserRole())

      expect(result.current.canEdit).toBe(true)
    })

    it('returns true for MEMBER', () => {
      vi.mocked(AuthContext.useAuth).mockReturnValue({
        userRole: UserRole.MEMBER,
        isAdmin: false,
        isOwner: false,
      } as any)

      const { result } = renderHook(() => useUserRole())

      expect(result.current.canEdit).toBe(true)
    })

    it('returns false for VIEWER', () => {
      vi.mocked(AuthContext.useAuth).mockReturnValue({
        userRole: UserRole.VIEWER,
        isAdmin: false,
        isOwner: false,
      } as any)

      const { result } = renderHook(() => useUserRole())

      expect(result.current.canEdit).toBe(false)
    })

    it('returns false for TENANT', () => {
      vi.mocked(AuthContext.useAuth).mockReturnValue({
        userRole: UserRole.TENANT,
        isAdmin: false,
        isOwner: false,
      } as any)

      const { result } = renderHook(() => useUserRole())

      expect(result.current.canEdit).toBe(false)
    })
  })

  describe('canDelete', () => {
    it('returns true for OWNER', () => {
      vi.mocked(AuthContext.useAuth).mockReturnValue({
        userRole: UserRole.OWNER,
        isAdmin: true,
        isOwner: true,
      } as any)

      const { result } = renderHook(() => useUserRole())

      expect(result.current.canDelete).toBe(true)
    })

    it('returns true for ADMIN', () => {
      vi.mocked(AuthContext.useAuth).mockReturnValue({
        userRole: UserRole.ADMIN,
        isAdmin: true,
        isOwner: false,
      } as any)

      const { result } = renderHook(() => useUserRole())

      expect(result.current.canDelete).toBe(true)
    })

    it('returns false for MEMBER', () => {
      vi.mocked(AuthContext.useAuth).mockReturnValue({
        userRole: UserRole.MEMBER,
        isAdmin: false,
        isOwner: false,
      } as any)

      const { result } = renderHook(() => useUserRole())

      expect(result.current.canDelete).toBe(false)
    })

    it('returns false for VIEWER', () => {
      vi.mocked(AuthContext.useAuth).mockReturnValue({
        userRole: UserRole.VIEWER,
        isAdmin: false,
        isOwner: false,
      } as any)

      const { result } = renderHook(() => useUserRole())

      expect(result.current.canDelete).toBe(false)
    })
  })

  describe('canManageUsers', () => {
    it('returns true for OWNER', () => {
      vi.mocked(AuthContext.useAuth).mockReturnValue({
        userRole: UserRole.OWNER,
        isAdmin: true,
        isOwner: true,
      } as any)

      const { result } = renderHook(() => useUserRole())

      expect(result.current.canManageUsers).toBe(true)
    })

    it('returns true for ADMIN', () => {
      vi.mocked(AuthContext.useAuth).mockReturnValue({
        userRole: UserRole.ADMIN,
        isAdmin: true,
        isOwner: false,
      } as any)

      const { result } = renderHook(() => useUserRole())

      expect(result.current.canManageUsers).toBe(true)
    })

    it('returns false for MEMBER', () => {
      vi.mocked(AuthContext.useAuth).mockReturnValue({
        userRole: UserRole.MEMBER,
        isAdmin: false,
        isOwner: false,
      } as any)

      const { result } = renderHook(() => useUserRole())

      expect(result.current.canManageUsers).toBe(false)
    })
  })

  describe('isReadOnly', () => {
    it('returns true for VIEWER', () => {
      vi.mocked(AuthContext.useAuth).mockReturnValue({
        userRole: UserRole.VIEWER,
        isAdmin: false,
        isOwner: false,
      } as any)

      const { result } = renderHook(() => useUserRole())

      expect(result.current.isReadOnly).toBe(true)
    })

    it('returns false for OWNER', () => {
      vi.mocked(AuthContext.useAuth).mockReturnValue({
        userRole: UserRole.OWNER,
        isAdmin: true,
        isOwner: true,
      } as any)

      const { result } = renderHook(() => useUserRole())

      expect(result.current.isReadOnly).toBe(false)
    })

    it('returns false for ADMIN', () => {
      vi.mocked(AuthContext.useAuth).mockReturnValue({
        userRole: UserRole.ADMIN,
        isAdmin: true,
        isOwner: false,
      } as any)

      const { result } = renderHook(() => useUserRole())

      expect(result.current.isReadOnly).toBe(false)
    })

    it('returns false for MEMBER', () => {
      vi.mocked(AuthContext.useAuth).mockReturnValue({
        userRole: UserRole.MEMBER,
        isAdmin: false,
        isOwner: false,
      } as any)

      const { result } = renderHook(() => useUserRole())

      expect(result.current.isReadOnly).toBe(false)
    })
  })
})
