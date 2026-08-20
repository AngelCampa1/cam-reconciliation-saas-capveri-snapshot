/**
 * Single source of truth for the GL source-system enum and its friendly labels.
 *
 * The backend returns a raw enum ("yardi" | "mri" | "generic") for a detected
 * general-ledger export. Three ingestion/onboarding surfaces previously each
 * kept their own byte-identical copy of this label map (ImportHistoryList,
 * SourceDetection, UploadFileStep); they now share this module.
 *
 * Intentionally NOT covered here (these keep their own local maps because their
 * output diverges on purpose):
 * - ActualBilledUploadStep maps `generic` -> "your spreadsheet" as inline prose,
 *   not an artifact label, and carries extra `_recon`/`csv_import` keys.
 * - RentRollPreview keys on the `*_rent_roll` variants and labels MRI as
 *   "MRI Software" (rent-roll surface), distinct from the GL "MRI Commercial".
 */
export type SourceSystem = 'yardi' | 'mri' | 'generic'

export const SOURCE_LABELS: Record<SourceSystem, string> = {
  yardi: 'Yardi Voyager',
  mri: 'MRI Commercial',
  generic: 'Generic Format',
}

export const SOURCE_DESCRIPTIONS: Record<SourceSystem, string> = {
  yardi: 'Yardi Voyager General Ledger export',
  mri: 'MRI Commercial Rent Roll export',
  generic: 'Generic CSV/Excel format (requires manual mapping)',
}

/**
 * Friendly label for a raw source enum, falling back to the raw value when the
 * key is unknown (backend enums can outpace the frontend map).
 */
export function getSourceLabel(source: string): string {
  return SOURCE_LABELS[source as SourceSystem] ?? source
}
