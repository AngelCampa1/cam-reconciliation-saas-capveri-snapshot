/**
 * Human-readable file-size formatting for upload/download/export UI.
 *
 * Several surfaces (the file uploader, upload progress, dispute attachments,
 * export history) each re-implemented the SAME bytes -> B/KB/MB conversion
 * inline. The logic was identical everywhere (thresholds at 1024 and 1024^2,
 * one decimal place), so the duplication was pure churn risk: a change to the
 * unit scale or precision would have to be made in four places. This is the one
 * canonical formatter instead.
 */

/**
 * Format a byte count as a short size string: bytes under 1 KB show as "B",
 * under 1 MB as "KB", and larger as "MB", each with one decimal place for the
 * KB/MB tiers. Callers that need an empty placeholder for a missing size should
 * guard for that themselves before calling (this always formats a real number).
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
