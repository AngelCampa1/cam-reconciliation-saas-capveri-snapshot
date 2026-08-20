/**
 * Export feature types and interfaces.
 *
 * Defines types for export options, formats, and metadata.
 */

import { ERPFormat } from '@/types/enums'

/**
 * Unified export format identifier.
 * Extends ERPFormat to include PDF and Excel.
 */
export type ExportFormat = 'pdf' | 'excel' | ERPFormat

/**
 * PDF-specific export options.
 */
export interface PDFExportOptions {
  includeCoverPage: boolean
  includeCalculationDetails: boolean
}

/**
 * Excel-specific export options.
 */
export interface ExcelExportOptions {
  separateSheetsPerTenant: boolean
  includeFormulas: boolean
}

/**
 * ERP-specific export options.
 */
export interface ERPExportOptions {
  targetSystem: ERPFormat
}

/**
 * Unified export options type.
 */
export type ExportOptions =
  | ({ format: 'pdf' } & PDFExportOptions)
  | ({ format: 'excel' } & ExcelExportOptions)
  | ({ format: 'yardi' | 'mri' | 'csv' } & ERPExportOptions)

/**
 * Format metadata for display.
 */
export interface FormatMetadata {
  id: ExportFormat
  name: string
  description: string
  icon: string
}

/**
 * Export format definitions with metadata.
 */
export const EXPORT_FORMATS: FormatMetadata[] = [
  {
    id: 'pdf',
    name: 'PDF Tenant Packet',
    description: 'Professional reconciliation statement for tenant delivery',
    icon: 'FileText',
  },
  {
    id: 'excel',
    name: 'Excel Spreadsheet',
    description: 'Detailed workbook with calculations and formulas',
    icon: 'FileSpreadsheet',
  },
  {
    id: 'yardi',
    name: 'Yardi Voyager',
    description: 'Journal entry import format for Yardi',
    icon: 'Building2',
  },
  {
    id: 'mri',
    name: 'MRI Commercial',
    description: 'Fixed-width format for MRI import',
    icon: 'Building',
  },
]

/**
 * Batch PDF export mode.
 */
export type BatchPDFExportMode = 'zip' | 'combined'

/**
 * Batch PDF export options.
 */
export interface BatchPDFExportOptions extends PDFExportOptions {
  snapshotId: string
  tenantIds: string[]
  mode: BatchPDFExportMode
}

/**
 * Batch export progress information.
 */
export interface BatchPDFProgress {
  completed: number
  total: number
  currentTenant?: string
  estimatedTimeRemaining?: number // in seconds
  errors?: Array<{ tenantId: string; error: string }>
}

/**
 * Tenant information for selection.
 */
export interface TenantInfo {
  id: string
  name: string
  suiteNumber?: string
}

/**
 * ERP system types supported for export.
 */
export type ERPSystem = 'yardi' | 'mri' | 'custom'

/**
 * Date format options for ERP exports.
 */
export type DateFormat =
  | 'MMDDYYYY'
  | 'YYYYMMDD'
  | 'DDMMYYYY'
  | 'MM/DD/YYYY'
  | 'YYYY-MM-DD'

/**
 * Field mapping for ERP export.
 */
export interface FieldMapping {
  sourceField: string
  targetField: string
  required: boolean
  defaultValue?: string
  transform?: 'uppercase' | 'lowercase' | 'trim' | 'padLeft' | 'padRight'
  maxLength?: number
}

/**
 * ERP export configuration.
 */
export interface ERPConfig {
  system: ERPSystem
  dateFormat: DateFormat
  fieldMappings: FieldMapping[]
  glAccountOverrides?: Record<string, string>
  templateName?: string
}

/**
 * ERP export template for reuse.
 */
export interface ERPTemplate {
  id: string
  name: string
  system: ERPSystem
  config: ERPConfig
  createdAt: string
  updatedAt: string
}

/**
 * Default field mappings for each ERP system.
 */
export const ERP_FIELD_MAPPINGS: Record<ERPSystem, FieldMapping[]> = {
  yardi: [
    {
      sourceField: 'date',
      targetField: 'Transaction Date',
      required: true,
      maxLength: 10,
    },
    {
      sourceField: 'accountCode',
      targetField: 'GL Account',
      required: true,
      maxLength: 20,
    },
    {
      sourceField: 'debitAmount',
      targetField: 'Debit',
      required: false,
      defaultValue: '0.00',
    },
    {
      sourceField: 'creditAmount',
      targetField: 'Credit',
      required: false,
      defaultValue: '0.00',
    },
    {
      sourceField: 'description',
      targetField: 'Description',
      required: true,
      transform: 'uppercase',
      maxLength: 50,
    },
    {
      sourceField: 'reference',
      targetField: 'Reference',
      required: false,
      maxLength: 30,
    },
  ],
  mri: [
    {
      sourceField: 'date',
      targetField: 'PERIOD',
      required: true,
      maxLength: 8,
    },
    {
      sourceField: 'accountCode',
      targetField: 'ACCOUNT',
      required: true,
      transform: 'padLeft',
      maxLength: 15,
    },
    {
      sourceField: 'amount',
      targetField: 'AMOUNT',
      required: true,
      maxLength: 15,
    },
    {
      sourceField: 'description',
      targetField: 'DESC',
      required: true,
      maxLength: 40,
    },
    {
      sourceField: 'source',
      targetField: 'SOURCE',
      required: true,
      defaultValue: 'CAM',
      maxLength: 4,
    },
    {
      sourceField: 'reference',
      targetField: 'REF',
      required: false,
      maxLength: 20,
    },
  ],
  custom: [
    {
      sourceField: 'date',
      targetField: 'Date',
      required: true,
    },
    {
      sourceField: 'accountCode',
      targetField: 'Account',
      required: true,
    },
    {
      sourceField: 'amount',
      targetField: 'Amount',
      required: true,
    },
    {
      sourceField: 'description',
      targetField: 'Description',
      required: false,
    },
  ],
}

/**
 * Export format type for filtering.
 * Includes 'all' option for showing all formats.
 */
export type ExportFormatFilter = 'pdf' | 'excel' | 'erp' | 'all'

/**
 * Export status.
 */
export type ExportStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'expired'

/**
 * Date range filter.
 */
export interface DateRange {
  from: Date
  to: Date
}

/**
 * Export history filters.
 */
export interface ExportFilters {
  format?: ExportFormatFilter
  dateRange?: DateRange
  status?: ExportStatus
}

/**
 * Export history record.
 */
export interface ExportRecord {
  id: string
  propertyId: string
  format: ExportFormat
  fileName: string
  fileUrl?: string
  fileSize?: number
  status: ExportStatus
  createdBy: string
  createdByName: string
  createdAt: string
  expiresAt?: string
  errorMessage?: string
}

/**
 * Export history response with pagination.
 */
export interface ExportHistoryResponse {
  items: ExportRecord[]
  total: number
  page: number
  pageSize: number
}

/**
 * Severity level for detail advisory findings.
 */
export type DetailSeverity = 'ok' | 'suggestion' | 'warning' | 'critical'

/**
 * Grouping suggestion from the detail advisor.
 */
export interface GroupingSuggestion {
  category_name: string
  current_line_count: number
  suggested_label: string
  severity: DetailSeverity
  explanation: string
}

/**
 * Immaterial item flagged by the detail advisor.
 */
export interface ImmaterialItem {
  account_code: string
  account_description: string
  amount: number
  percent_of_total: number
  pool_name: string
}

/**
 * Detail level advisory response from the backend.
 */
export interface DetailLevelAdvisoryResponse {
  total_line_items: number
  total_categories: number
  overall_severity: DetailSeverity
  summary: string
  grouping_suggestions: GroupingSuggestion[]
  immaterial_items: ImmaterialItem[]
  suggested_total_lines: number
}

/**
 * Variance type for indicating direction of change.
 *
 * `new` means there was no prior-year amount to compare against (prior was
 * $0), so a percent change is undefined. We label these "New" instead of a
 * misleading "+0.00%".
 */
export type VarianceType = 'increase' | 'decrease' | 'unchanged' | 'new'

/**
 * Variance item comparing current and prior year values.
 */
export interface VarianceItem {
  poolId: string
  poolName: string
  currentAmount: number
  priorAmount: number
  varianceAmount: number
  variancePercent: number
  varianceType: VarianceType
  /**
   * True when the prior year had no amount ($0) but the current year does.
   * The percent change is undefined here, so the UI shows "New".
   */
  isNew: boolean
}

/**
 * Variance comparison response.
 */
export interface VarianceComparisonResponse {
  propertyId: string
  propertyName: string
  years: number[]
  baseYear: number
  currentYear: number
  currentPeriod: string
  priorPeriod: string
  items: VarianceItem[]
  totalCurrentAmount: number
  totalPriorAmount: number
  totalVarianceAmount: number
  totalVariancePercent: number
  /**
   * True when the prior year had no total ($0) but the current year does, so
   * the total percent change is undefined. The UI shows "New" rather than a
   * misleading "+0.00%".
   */
  isTotalNew: boolean
}
