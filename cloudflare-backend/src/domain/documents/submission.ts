export type DocumentType =
  | "lease"
  | "amendment"
  | "rent_roll"
  | "gl_export"
  | "other";

export type DocumentStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "ready_for_review"
  | "verified"
  | "rejected";

export type ExtractionJobStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "retrying";

export type CreateDocumentInput = {
  organizationId: string;
  propertyId: string;
  filename: string;
  storageKey: string;
  storageBucket: string;
  contentType: string;
  fileSizeBytes: number;
  documentType: DocumentType;
  leaseId?: string;
};

export type CreatedDocument = {
  id: string;
  status: DocumentStatus;
};

export type DocumentRecord = {
  id: string;
  organizationId: string;
  propertyId: string;
  filename: string;
  storageKey: string | null;
  contentType: string;
  fileSizeBytes: number;
  documentType: DocumentType;
  status: DocumentStatus;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  processedAt: string | null;
};

export type DocumentListQuery = {
  organizationId: string;
  propertyId?: string;
  status?: DocumentStatus;
  skip: number;
  limit: number;
};

export type DeleteDocumentResult = {
  storageKey: string | null;
};

export type ExtractionJobSummary = {
  id: string;
  documentId: string;
  organizationId: string;
  status: ExtractionJobStatus;
  priority: number;
  retryCount: number;
  errorMessage: string | null;
  resultData: Record<string, unknown> | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  nextRetryAt: string | null;
};

export type ExtractionListItem = {
  id: string;
  filename: string;
  status: DocumentStatus;
  createdAt: string;
  processedAt: string | null;
  verifiedAt: string | null;
  extractionResult: Record<string, unknown> | null;
};

export type ExtractionListQuery = {
  organizationId: string;
  status?: DocumentStatus;
  page: number;
  pageSize: number;
};

export type ExtractionListPage = {
  items: ExtractionListItem[];
  total: number;
  page: number;
  pageSize: number;
  hasNext: boolean;
};

export type ExtractionDetail = {
  id: string;
  filename: string;
  status: DocumentStatus;
  storageBucket: string;
  storageKey: string;
  contentType: string;
  fileSizeBytes: number;
  extractionResult: Record<string, unknown> | null;
  createdAt: string;
  processedAt: string | null;
  verifiedAt: string | null;
  verifiedBy: string | null;
  propertyId: string;
  leaseId: string | null;
  editHistory: Record<string, unknown>[];
};

export type ExtractionSubmission = {
  documentId: string;
  jobId: string;
  organizationId: string;
  priority: number;
};

export type SaveExtractionDraftInput = {
  documentId: string;
  organizationId: string;
  profile: Record<string, unknown>;
};

export type ApproveExtractionInput = {
  documentId: string;
  organizationId: string;
  userId: string;
  profile: Record<string, unknown>;
  editHistory: Record<string, unknown>[];
  leaseId?: string;
};

export type ApproveExtractionResult = {
  leaseId: string;
};

export type RejectExtractionInput = {
  documentId: string;
  organizationId: string;
  userId: string;
  reason: string;
  notes: string | null;
  requeue: boolean;
  priority: number;
};

export type RejectExtractionResult = {
  message: string;
  submission?: ExtractionSubmission;
};

export type RetryExtractionJobResult = {
  job: ExtractionJobSummary;
  delaySeconds: number;
  previousRetryCount: number;
};

export type DocumentSubmissionRepository = {
  hasFullAccess(organizationId: string): Promise<boolean>;
  recordFeatureUse(input: {
    organizationId: string;
    featureKey: string;
  }): Promise<void>;
  createDocument(input: CreateDocumentInput): Promise<CreatedDocument>;
  listDocuments(query: DocumentListQuery): Promise<DocumentRecord[]>;
  getDocument(input: {
    documentId: string;
    organizationId: string;
  }): Promise<DocumentRecord | null>;
  deleteDocument(input: {
    documentId: string;
    organizationId: string;
    beforeDeleteStorage?: (storageKey: string) => Promise<void>;
  }): Promise<DeleteDocumentResult>;
  queueExtraction(input: {
    documentId: string;
    organizationId: string;
    priority: number;
  }): Promise<ExtractionSubmission>;
  markExtractionEnqueueFailed(input: {
    documentId: string;
    jobId: string;
    organizationId: string;
    errorMessage: string;
  }): Promise<void>;
  getExtractionJob(input: {
    jobId: string;
    organizationId: string;
  }): Promise<ExtractionJobSummary | null>;
  listExtractions(query: ExtractionListQuery): Promise<ExtractionListPage>;
  getExtractionDetail(input: {
    documentId: string;
    organizationId: string;
  }): Promise<ExtractionDetail | null>;
  saveExtractionDraft(input: SaveExtractionDraftInput): Promise<void>;
  approveExtraction(
    input: ApproveExtractionInput,
  ): Promise<ApproveExtractionResult>;
  rejectExtraction(
    input: RejectExtractionInput,
  ): Promise<RejectExtractionResult>;
  retryExtractionJob(input: {
    jobId: string;
    organizationId: string;
  }): Promise<RetryExtractionJobResult | null>;
  markRetryEnqueueFailed(input: {
    jobId: string;
    organizationId: string;
    errorMessage: string;
    retryCount: number;
  }): Promise<void>;
};

export class NotFoundError extends Error {
  constructor(readonly resource: "Property" | "Lease" | "Document" | "Job") {
    super(`${resource} not found`);
  }
}

export class InvalidDocumentStateError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export class LeaseFinalizedReferenceError extends Error {
  constructor(
    readonly leaseId: string,
    readonly finalizedSnapshotCount: number,
  ) {
    super(
      `Cannot update lease ${leaseId}: referenced by ${finalizedSnapshotCount} finalized snapshot(s)`,
    );
  }
}

export function supportsLeaseExtraction(documentType: DocumentType): boolean {
  return documentType === "lease" || documentType === "amendment";
}
