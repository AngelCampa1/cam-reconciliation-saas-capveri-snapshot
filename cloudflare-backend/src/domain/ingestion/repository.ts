export type BatchListRecord = {
  id: string;
  file_name: string;
  source_system: string;
  status: string;
  row_count: number | null;
  error_count: number | null;
  created_at: string;
};

export type BatchDetailRecord = BatchListRecord & {
  organization_id: string;
  property_id: string;
  error_log: unknown;
  updated_at: string;
  [key: string]: unknown;
};

export type PreviewEntryRecord = {
  id: string;
  transaction_date: string;
  account_code: string;
  account_description: string | null;
  description: string | null;
  amount: string | number;
};

export type DateRangeRecord = {
  min_date: string;
  max_date: string;
};

export type SourceSystem = "yardi" | "mri" | "generic";

export type ColumnMappingRecord = {
  id: string;
  name: string;
  description: string | null;
  source_system: SourceSystem;
  mapping_config: Record<string, string>;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type ColumnMappingListResult = {
  mappings: ColumnMappingRecord[];
  total: number;
};

export type CreateColumnMappingResult =
  | { state: "created"; mapping: ColumnMappingRecord }
  | { state: "duplicate" };

export type GlEntryInsert = {
  account_code: string;
  account_description: string;
  amount: string;
  transaction_date: string;
  accrual_date: string | null;
  period_year: number;
  period_month: number;
  vendor_name: string | null;
  description: string | null;
  raw_row_data: Record<string, string>;
};

export type UploadImportResult =
  | { state: "property_not_found" }
  | { state: "duplicate"; batchId: string; importedAt: string | null }
  | {
      state: "uploaded";
      batchId: string;
      sourceSystem: SourceSystem;
      rowCount: number;
      errorCount: number;
    };

export type ApplyMappingResult =
  | { state: "not_found" }
  | { state: "invalid_source"; sourceSystem: string }
  | { state: "invalid_status"; status: string }
  | { state: "file_mismatch" }
  | {
      state: "completed";
      batchId: string;
      propertyId: string;
      rowCount: number;
      errorCount: number;
    };

export type ApplyMappingPreflightResult =
  | { state: "ready"; propertyId: string }
  | Exclude<ApplyMappingResult, { state: "completed" }>;

export type RetryBatchResult =
  | { state: "not_found" }
  | { state: "invalid_status"; status: string }
  | { state: "finalized_reconciliation" }
  | { state: "retried"; deletedGlEntryCount: number };

export type DeleteBatchResult =
  | { state: "not_found" }
  | { state: "finalized_reconciliation" }
  | { state: "deleted"; deletedGlEntryCount: number };

/**
 * A single import batch row as returned by listPropertyImports.
 * Mirrors the field set needed by the ImportBatchSummary Python schema.
 * Columns that may be absent in older rows carry the legacy fallback name.
 */
export type PropertyImportRecord = {
  id: string;
  /** Canonical column; falls back to file_name in mapper. */
  filename: string | null;
  file_name: string | null;
  status: string;
  /** Canonical column; falls back to source_system in mapper. */
  parser_type: string | null;
  source_system: string | null;
  /** Canonical column; falls back to row_count in mapper. */
  rows_processed: number | null;
  row_count: number | null;
  rows_failed: number | null;
  error_count: number | null;
  rows_imported: number | null;
  created_at: string;
  completed_at: string | null;
  error_message: string | null;
};

export type PropertyImportListResult = {
  imports: PropertyImportRecord[];
  total: number;
};

export type IngestionRepository = {
  hasFullAccess(organizationId: string): Promise<boolean>;
  uploadImport(input: {
    organizationId: string;
    propertyId: string;
    fileName: string;
    fileHash: string;
    sourceSystem: SourceSystem;
    entries: GlEntryInsert[];
    errorCount: number;
  }): Promise<UploadImportResult>;
  applyMapping(input: {
    batchId: string;
    organizationId: string;
    fileHash: string;
    entries: GlEntryInsert[];
    errorCount: number;
  }): Promise<ApplyMappingResult>;
  preflightApplyMapping(input: {
    batchId: string;
    organizationId: string;
    fileHash: string;
  }): Promise<ApplyMappingPreflightResult>;
  listColumnMappings(input: {
    organizationId: string;
    sourceSystem?: SourceSystem;
    skip: number;
    limit: number;
  }): Promise<ColumnMappingListResult>;
  createColumnMapping(input: {
    organizationId: string;
    userId: string;
    name: string;
    description: string | null;
    sourceSystem: SourceSystem;
    mappingConfig: Record<string, string>;
  }): Promise<CreateColumnMappingResult>;
  listBatches(organizationId: string): Promise<BatchListRecord[]>;
  getBatch(input: {
    batchId: string;
    organizationId: string;
  }): Promise<BatchDetailRecord | null>;
  listPreviewEntries(input: {
    batchId: string;
    propertyId: string;
    organizationId: string;
  }): Promise<PreviewEntryRecord[]>;
  retryBatch(input: {
    batchId: string;
    organizationId: string;
  }): Promise<RetryBatchResult>;
  deleteBatch(input: {
    batchId: string;
    organizationId: string;
  }): Promise<DeleteBatchResult>;
  getGlDateRange(input: {
    propertyId: string;
    organizationId: string;
  }): Promise<DateRangeRecord | null>;
  listPropertyImports(input: {
    propertyId: string;
    organizationId: string;
    page: number;
    size: number;
    status?: string;
  }): Promise<PropertyImportListResult>;
};
