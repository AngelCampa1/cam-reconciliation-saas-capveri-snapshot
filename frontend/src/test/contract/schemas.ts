/**
 * Zod schemas for API contract validation
 *
 * These schemas match the TypeScript types generated from the OpenAPI spec.
 * Used for runtime validation of API responses in tests.
 */
import { z } from 'zod'

// ============================================================================
// Enum Schemas
// ============================================================================

export const CapTypeSchema = z.enum([
  'none',
  'non_cumulative',
  'cumulative',
  'cumulative_compounding',
])

export const LeaseStatusSchema = z.enum([
  'draft',
  'active',
  'expired',
  'terminated',
])

export const UnitStatusSchema = z.enum([
  'vacant',
  'occupied',
  'under_renovation',
])

export const PoolTypeSchema = z.enum([
  'operating',
  'tax',
  'insurance',
  'capital',
  'other',
])

// ============================================================================
// Property Schemas
// ============================================================================

export const PropertySchema = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  name: z.string().min(1).max(255),
  address_line1: z.string().max(255),
  address_line2: z.string().max(255).nullable(),
  city: z.string().max(100),
  state: z.string().length(2),
  postal_code: z.string().max(20),
  total_rentable_sqft: z.string(),
  total_usable_sqft: z.string(),
  common_area_sqft: z.string(),
  target_occupancy: z.string(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
})

export const PropertyCreateSchema = z.object({
  name: z.string().min(1).max(255),
  address_line1: z.string().max(255),
  address_line2: z.string().max(255).nullable().optional(),
  city: z.string().max(100),
  state: z.string().length(2),
  postal_code: z.string().max(20),
  total_rentable_sqft: z.union([z.number().positive(), z.string()]),
  total_usable_sqft: z.union([z.number().positive(), z.string()]),
  common_area_sqft: z.union([z.number().min(0), z.string()]),
  target_occupancy: z.union([z.number().min(0).max(1), z.string()]).optional(),
})

export const PropertyUpdateSchema = z.object({
  name: z.string().min(1).max(255).nullable().optional(),
  address_line1: z.string().max(255).nullable().optional(),
  address_line2: z.string().max(255).nullable().optional(),
  city: z.string().max(100).nullable().optional(),
  state: z.string().length(2).nullable().optional(),
  postal_code: z.string().max(20).nullable().optional(),
  total_rentable_sqft: z
    .union([z.number().positive(), z.string()])
    .nullable()
    .optional(),
  total_usable_sqft: z
    .union([z.number().positive(), z.string()])
    .nullable()
    .optional(),
  common_area_sqft: z
    .union([z.number().min(0), z.string()])
    .nullable()
    .optional(),
  target_occupancy: z
    .union([z.number().min(0).max(1), z.string()])
    .nullable()
    .optional(),
})

export const PropertyListResponseSchema = z.object({
  data: z.array(PropertySchema),
  count: z.number().int().min(0),
  has_more: z.boolean(),
})

// ============================================================================
// Unit Schemas
// ============================================================================

export const UnitSchema = z.object({
  id: z.string().uuid(),
  property_id: z.string().uuid(),
  unit_number: z.string().min(1).max(50),
  rentable_sqft: z.string(),
  usable_sqft: z.string(),
  floor: z.number().int().min(0).nullable(),
  status: UnitStatusSchema,
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
})

export const UnitCreateRequestSchema = z.object({
  unit_number: z.string().min(1).max(50),
  rentable_sqft: z.union([z.number().positive(), z.string()]),
  usable_sqft: z.union([z.number().positive(), z.string()]),
  floor: z.number().int().min(0).nullable().optional(),
  status: UnitStatusSchema.optional(),
})

export const UnitUpdateSchema = z.object({
  unit_number: z.string().min(1).max(50).nullable().optional(),
  rentable_sqft: z
    .union([z.number().positive(), z.string()])
    .nullable()
    .optional(),
  usable_sqft: z
    .union([z.number().positive(), z.string()])
    .nullable()
    .optional(),
  floor: z.number().int().min(0).nullable().optional(),
  status: UnitStatusSchema.nullable().optional(),
})

export const UnitListResponseSchema = z.object({
  data: z.array(UnitSchema),
  count: z.number().int().min(0),
  has_more: z.boolean(),
})

// ============================================================================
// Lease Recovery Profile Schemas
// ============================================================================

export const LeaseRecoveryProfileOutputSchema = z.object({
  base_year: z.number().int().min(1990).max(2100).nullable(),
  base_year_amount: z.string().nullable(),
  gross_up_base_year: z.boolean(),
  pro_rata_share: z.string(),
  cap_type: CapTypeSchema,
  cap_rate: z.string().nullable(),
  admin_fee_percentage: z.string(),
  excluded_pools: z.array(PoolTypeSchema),
})

export const LeaseRecoveryProfileInputSchema = z.object({
  base_year: z.number().int().min(1990).max(2100).nullable().optional(),
  base_year_amount: z
    .union([z.number().min(0), z.string()])
    .nullable()
    .optional(),
  gross_up_base_year: z.boolean().optional(),
  pro_rata_share: z.union([z.number().min(0).max(1), z.string()]),
  cap_type: CapTypeSchema.optional(),
  cap_rate: z
    .union([z.number().min(0).max(1), z.string()])
    .nullable()
    .optional(),
  admin_fee_percentage: z
    .union([z.number().min(0).max(0.2), z.string()])
    .optional(),
  excluded_pools: z.array(PoolTypeSchema).optional(),
})

// ============================================================================
// Lease Schemas
// ============================================================================

export const LeaseSchema = z.object({
  id: z.string().uuid(),
  property_id: z.string().uuid(),
  unit_id: z.string().uuid().nullable(),
  tenant_name: z.string().min(1).max(255),
  start_date: z.string(),
  end_date: z.string(),
  status: LeaseStatusSchema,
  recovery_profile: LeaseRecoveryProfileOutputSchema,
  document_url: z.string().max(2048).nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
})

export const LeaseCreateSchema = z.object({
  property_id: z.string().uuid(),
  unit_id: z.string().uuid().nullable().optional(),
  tenant_name: z.string().min(1).max(255),
  start_date: z.string(),
  end_date: z.string(),
  status: LeaseStatusSchema.optional(),
  recovery_profile: LeaseRecoveryProfileInputSchema,
  document_url: z.string().max(2048).nullable().optional(),
})

export const LeaseUpdateSchema = z.object({
  tenant_name: z.string().min(1).max(255).nullable().optional(),
  start_date: z.string().nullable().optional(),
  end_date: z.string().nullable().optional(),
  status: LeaseStatusSchema.nullable().optional(),
  recovery_profile: LeaseRecoveryProfileInputSchema.partial()
    .nullable()
    .optional(),
  unit_id: z.string().uuid().nullable().optional(),
  document_url: z.string().max(2048).nullable().optional(),
})

export const LeaseListResponseSchema = z.object({
  data: z.array(LeaseSchema),
  count: z.number().int().min(0),
  has_more: z.boolean(),
})

// ============================================================================
// Error Schemas
// ============================================================================

export const ValidationErrorSchema = z.object({
  loc: z.array(z.union([z.string(), z.number()])),
  msg: z.string(),
  type: z.string(),
})

export const HTTPValidationErrorSchema = z.object({
  detail: z.array(ValidationErrorSchema).optional(),
})

export const ErrorResponseSchema = z.object({
  detail: z.string(),
})

// ============================================================================
// Type Exports (inferred from Zod schemas)
// ============================================================================

export type Property = z.infer<typeof PropertySchema>
export type PropertyCreate = z.infer<typeof PropertyCreateSchema>
export type PropertyUpdate = z.infer<typeof PropertyUpdateSchema>
export type PropertyListResponse = z.infer<typeof PropertyListResponseSchema>

export type Unit = z.infer<typeof UnitSchema>
export type UnitCreateRequest = z.infer<typeof UnitCreateRequestSchema>
export type UnitUpdate = z.infer<typeof UnitUpdateSchema>
export type UnitListResponse = z.infer<typeof UnitListResponseSchema>

export type Lease = z.infer<typeof LeaseSchema>
export type LeaseCreate = z.infer<typeof LeaseCreateSchema>
export type LeaseUpdate = z.infer<typeof LeaseUpdateSchema>
export type LeaseListResponse = z.infer<typeof LeaseListResponseSchema>

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>
export type ValidationError = z.infer<typeof ValidationErrorSchema>
export type HTTPValidationError = z.infer<typeof HTTPValidationErrorSchema>
