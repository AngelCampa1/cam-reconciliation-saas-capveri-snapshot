/**
 * Snake_case → Title Case label formatting.
 *
 * Turns an enum-style `snake_case` value (`non_cumulative`, `property_manager`)
 * into a human label (`Non Cumulative`, `Property Manager`): underscores become
 * spaces, then the first letter of each word is capitalized. The rest of each
 * word is left untouched, so an already-cased acronym is preserved.
 *
 * SSOT for the byte-identical inline transform that lived in TermVersionTimeline
 * (`formatCapType`), CapBankLedger (`formatCapType`), and ProfilePage
 * (`formatRoleLabel` fallback). Callers that need a curated label map first
 * (e.g. `ROLE_LABELS`) keep the lookup and fall back to this for unknown keys.
 *
 * NOT for status strings that only need underscores stripped without
 * capitalization (e.g. DisputeStatusBadge, ExtractionStatusBadge,
 * LeaseDetailPage cap_type) — those keep their own local `.replace(/_/g, ' ')`.
 */
export function snakeToTitleCase(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}
