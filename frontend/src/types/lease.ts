/**
 * Lease domain types for tenant agreements.
 *
 * These Zod schemas match exactly with backend/app/models/lease.py.
 * The Lease model tracks tenant agreements with embedded recovery profile.
 */

import { z } from 'zod'

import { LeaseStatus } from './enums'
import {
  LeaseRecoveryProfileSchema,
  LeaseRecoveryProfileUpdateSchema,
} from './lease-recovery-profile'

/**
 * Zod schema for LeaseStatus enum values.
 */
export const LeaseStatusSchema = z.enum([
  'draft',
  'active',
  'expired',
  'terminated',
])

/**
 * Full Lease model stored in database.
 *
 * Contains all lease data including the embedded recovery profile
 * used by the financial calculation engine.
 */
export const LeaseSchema = z
  .object({
    id: z.string().uuid(),
    property_id: z.string().uuid(),
    unit_id: z.string().uuid().nullable().optional(),
    tenant_name: z.string().min(1).max(255),
    start_date: z.string().date(),
    end_date: z.string().date(),
    status: LeaseStatusSchema.default('draft'),
    recovery_profile: LeaseRecoveryProfileSchema,
    document_url: z.string().max(2048).nullable().optional(),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
  })
  .refine((data) => new Date(data.end_date) > new Date(data.start_date), {
    message: 'End date must be after start date',
    path: ['end_date'],
  })

export type Lease = z.infer<typeof LeaseSchema>

/**
 * DTO for creating a lease.
 *
 * Requires property_id and all base fields. Unit_id is optional
 * since a lease might cover multiple units or the entire property.
 */
export const LeaseCreateSchema = z
  .object({
    property_id: z.string().uuid(),
    unit_id: z.string().uuid().nullable().optional(),
    tenant_name: z.string().min(1).max(255),
    start_date: z.string().date(),
    end_date: z.string().date(),
    status: LeaseStatusSchema.default('draft'),
    recovery_profile: LeaseRecoveryProfileSchema,
    document_url: z.string().max(2048).nullable().optional(),
  })
  .refine((data) => new Date(data.end_date) > new Date(data.start_date), {
    message: 'End date must be after start date',
    path: ['end_date'],
  })

export type LeaseCreate = z.infer<typeof LeaseCreateSchema>

/**
 * DTO for updating a lease.
 *
 * All fields are optional for partial updates. Date validation
 * must be checked at the service layer when merging with existing values.
 */
export const LeaseUpdateSchema = z.object({
  tenant_name: z.string().min(1).max(255).optional(),
  start_date: z.string().date().optional(),
  end_date: z.string().date().optional(),
  status: LeaseStatusSchema.optional(),
  recovery_profile: LeaseRecoveryProfileUpdateSchema.optional(),
  unit_id: z.string().uuid().nullable().optional(),
  document_url: z.string().max(2048).nullable().optional(),
})

export type LeaseUpdate = z.infer<typeof LeaseUpdateSchema>

/**
 * Summary view of a lease for list displays.
 *
 * Contains essential fields without the full recovery profile.
 */
export const LeaseSummarySchema = z.object({
  id: z.string().uuid(),
  property_id: z.string().uuid(),
  unit_id: z.string().uuid().nullable().optional(),
  tenant_name: z.string().min(1).max(255),
  start_date: z.string().date(),
  end_date: z.string().date(),
  status: LeaseStatusSchema,
})

export type LeaseSummary = z.infer<typeof LeaseSummarySchema>

/**
 * Helper to check if a lease status value is valid.
 */
export const isValidLeaseStatus = (value: string): value is LeaseStatus => {
  return Object.values(LeaseStatus).includes(value as LeaseStatus)
}
