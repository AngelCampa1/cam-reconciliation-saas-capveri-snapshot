/**
 * Tests for User domain types.
 * Schemas must match backend/app/models/user.py.
 */

import { describe, expect, it } from 'vitest'
import { ZodError } from 'zod'

import {
  isValidUserRole,
  UserCreateSchema,
  UserSchema,
  UserUpdateSchema,
  UserWithOrgSchema,
} from './user'

const validUser = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  organization_id: '660e8400-e29b-41d4-a716-446655440001',
  email: 'test@example.com',
  full_name: 'Test User',
  role: 'member',
  created_at: '2024-01-15T10:30:00Z',
  updated_at: '2024-01-20T15:45:00Z',
}

describe('UserSchema', () => {
  it('parses valid user', () => {
    const result = UserSchema.parse(validUser)
    expect(result.email).toBe('test@example.com')
    expect(result.role).toBe('member')
  })

  it('rejects invalid data', () => {
    expect(() => UserSchema.parse({})).toThrow(ZodError)
    expect(() => UserSchema.parse({ ...validUser, email: 'invalid' })).toThrow()
    expect(() =>
      UserSchema.parse({ ...validUser, role: 'superadmin' })
    ).toThrow()
  })

  it('accepts null full_name', () => {
    const result = UserSchema.parse({ ...validUser, full_name: null })
    expect(result.full_name).toBeNull()
  })
})

describe('UserCreateSchema', () => {
  const validUUID = '550e8400-e29b-41d4-a716-446655440000'

  it('creates with minimal fields and defaults role to member', () => {
    const result = UserCreateSchema.parse({
      email: 'new@example.com',
      organization_id: validUUID,
    })
    expect(result.email).toBe('new@example.com')
    expect(result.role).toBe('member')
  })

  it('requires email and organization_id', () => {
    expect(() =>
      UserCreateSchema.parse({ organization_id: validUUID })
    ).toThrow()
    expect(() =>
      UserCreateSchema.parse({ email: 'test@example.com' })
    ).toThrow()
  })
})

describe('UserUpdateSchema', () => {
  it('accepts empty object (all optional)', () => {
    expect(UserUpdateSchema.parse({})).toEqual({})
  })

  it('validates fields when provided', () => {
    expect(() => UserUpdateSchema.parse({ role: 'invalid' })).toThrow()
    expect(() =>
      UserUpdateSchema.parse({ full_name: 'x'.repeat(256) })
    ).toThrow()
  })
})

describe('UserWithOrgSchema', () => {
  it('extends UserSchema with organization_name', () => {
    const result = UserWithOrgSchema.parse({
      ...validUser,
      organization_name: 'Acme Corp',
    })
    expect(result.organization_name).toBe('Acme Corp')
    expect(result.email).toBe('test@example.com')
  })
})

describe('isValidUserRole helper', () => {
  it('validates user roles', () => {
    expect(isValidUserRole('owner')).toBe(true)
    expect(isValidUserRole('admin')).toBe(true)
    expect(isValidUserRole('superadmin')).toBe(false)
  })
})
