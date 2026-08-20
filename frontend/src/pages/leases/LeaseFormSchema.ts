/**
 * Lease Form Validation Schema
 *
 * Zod schema for validating lease form data including:
 * - Tenant name (required)
 * - Unit selection (optional)
 * - Start date (required)
 * - End date (required, must be after start date)
 * - Status (required)
 * - Recovery profile (required)
 */
import { z } from 'zod'
import { recoveryProfileSchema } from '@/components/leases/RecoveryProfileSchema'

export const leaseFormSchema = z
  .object({
    tenant_name: z
      .string()
      .min(2, 'Tenant name must be at least 2 characters')
      .max(255, 'Tenant name must be less than 255 characters'),
    unit_id: z.string().uuid('Invalid unit').or(z.literal('')).optional(),
    start_date: z.string().min(1, 'Start date is required'),
    end_date: z.string().min(1, 'End date is required'),
    status: z.enum(['draft', 'active', 'expired', 'terminated'], {
      required_error: 'Status is required',
    }),
    recovery_profile: recoveryProfileSchema,
  })
  .refine((data) => new Date(data.end_date) > new Date(data.start_date), {
    message: 'End date must be after start date',
    path: ['end_date'],
  })

export type LeaseFormData = z.infer<typeof leaseFormSchema>
