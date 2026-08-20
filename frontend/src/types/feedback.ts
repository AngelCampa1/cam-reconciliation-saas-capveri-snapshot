/**
 * Feedback domain types for user bug reports and feature requests.
 *
 * This module defines the Feedback entity for collecting user feedback,
 * including bug reports, feature requests, and general comments.
 * Supports screenshot attachments and rich metadata for debugging.
 */

import { z } from 'zod'

/**
 * Type of feedback submitted.
 *
 * Categorizes the nature of user feedback.
 */
export const FeedbackType = {
  BUG: 'bug',
  FEATURE_REQUEST: 'feature_request',
  GENERAL: 'general',
} as const
export type FeedbackType = (typeof FeedbackType)[keyof typeof FeedbackType]

/**
 * Current status of feedback item.
 *
 * Tracks the lifecycle of feedback through review process.
 */
export const FeedbackStatus = {
  NEW: 'new',
  REVIEWED: 'reviewed',
  RESOLVED: 'resolved',
  DISMISSED: 'dismissed',
} as const
export type FeedbackStatus =
  (typeof FeedbackStatus)[keyof typeof FeedbackStatus]

/**
 * Zod schema for feedback type validation.
 */
export const FeedbackTypeSchema = z.enum(['bug', 'feature_request', 'general'])

/**
 * Zod schema for feedback status validation.
 */
export const FeedbackStatusSchema = z.enum([
  'new',
  'reviewed',
  'resolved',
  'dismissed',
])

/**
 * Zod schema for feedback metadata.
 *
 * Flexible schema that allows additional properties for debugging context.
 */
export const FeedbackMetadataSchema = z
  .object({
    browser: z.string().optional(),
    os: z.string().optional(),
    viewport: z
      .object({
        width: z.number(),
        height: z.number(),
      })
      .optional(),
    console_errors: z.array(z.string()).optional(),
    component_stack: z.string().optional(),
  })
  .passthrough()

export type FeedbackMetadata = z.infer<typeof FeedbackMetadataSchema>

/**
 * Full feedback schema with all fields.
 */
export const FeedbackSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  organization_id: z.string().uuid(),
  type: FeedbackTypeSchema,
  status: FeedbackStatusSchema,
  message: z.string().min(10).max(5000),
  screenshot_url: z.string().url().nullable(),
  page_url: z.string().max(2000),
  user_agent: z.string().max(500).nullable(),
  metadata: FeedbackMetadataSchema.default({}),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
})

export type Feedback = z.infer<typeof FeedbackSchema>

/**
 * Schema for creating new feedback.
 */
export const FeedbackCreateSchema = z.object({
  type: FeedbackTypeSchema,
  message: z.string().min(10).max(5000),
  page_url: z.string().max(2000),
  screenshot_url: z.string().url().nullable().optional(),
  user_agent: z.string().max(500).nullable().optional(),
  metadata: FeedbackMetadataSchema.optional(),
})

export type FeedbackCreate = z.infer<typeof FeedbackCreateSchema>

/**
 * Schema for updating feedback (admin only).
 */
export const FeedbackUpdateSchema = z.object({
  status: FeedbackStatusSchema.optional(),
  metadata: FeedbackMetadataSchema.optional(),
})

export type FeedbackUpdate = z.infer<typeof FeedbackUpdateSchema>

/**
 * Lightweight feedback view for listings.
 */
export const FeedbackSummarySchema = z.object({
  id: z.string().uuid(),
  type: FeedbackTypeSchema,
  status: FeedbackStatusSchema,
  message: z.string(),
  page_url: z.string(),
  created_at: z.string().datetime(),
})

export type FeedbackSummary = z.infer<typeof FeedbackSummarySchema>

/**
 * Type guard for valid feedback type.
 */
export function isValidFeedbackType(value: unknown): value is FeedbackType {
  return FeedbackTypeSchema.safeParse(value).success
}

/**
 * Type guard for valid feedback status.
 */
export function isValidFeedbackStatus(value: unknown): value is FeedbackStatus {
  return FeedbackStatusSchema.safeParse(value).success
}

/**
 * Get display name for feedback type.
 */
export function getFeedbackTypeDisplayName(type: FeedbackType): string {
  const displayNames: Record<FeedbackType, string> = {
    bug: 'Bug Report',
    feature_request: 'Feature Request',
    general: 'General Feedback',
  }
  return displayNames[type]
}

/**
 * Get display name for feedback status.
 */
export function getFeedbackStatusDisplayName(status: FeedbackStatus): string {
  const displayNames: Record<FeedbackStatus, string> = {
    new: 'New',
    reviewed: 'Reviewed',
    resolved: 'Resolved',
    dismissed: 'Dismissed',
  }
  return displayNames[status]
}

/**
 * Check if feedback is still open (not resolved or dismissed).
 */
export function isFeedbackOpen(status: FeedbackStatus): boolean {
  return status === 'new' || status === 'reviewed'
}

/**
 * Check if feedback is closed (resolved or dismissed).
 */
export function isFeedbackClosed(status: FeedbackStatus): boolean {
  return status === 'resolved' || status === 'dismissed'
}

/**
 * Get status badge color class for feedback status.
 */
export function getFeedbackStatusColor(
  status: FeedbackStatus
): 'default' | 'secondary' | 'success' | 'destructive' {
  const colors: Record<
    FeedbackStatus,
    'default' | 'secondary' | 'success' | 'destructive'
  > = {
    new: 'default',
    reviewed: 'secondary',
    resolved: 'success',
    dismissed: 'destructive',
  }
  return colors[status]
}

/**
 * Get type badge color class for feedback type.
 */
export function getFeedbackTypeColor(
  type: FeedbackType
): 'default' | 'secondary' | 'destructive' {
  const colors: Record<FeedbackType, 'default' | 'secondary' | 'destructive'> =
    {
      bug: 'destructive',
      feature_request: 'secondary',
      general: 'default',
    }
  return colors[type]
}

/**
 * Truncate message for display in list views.
 */
export function truncateFeedbackMessage(
  message: string,
  maxLength: number = 100
): string {
  if (message.length <= maxLength) {
    return message
  }
  return message.slice(0, maxLength).trim() + '...'
}
