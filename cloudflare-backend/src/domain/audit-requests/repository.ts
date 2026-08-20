/**
 * Domain types and repository interface for the audit_requests table.
 *
 * Status values mirror the Python AuditRequestStatus enum.
 */

export type AuditRequestStatus =
  | "pending"
  | "contacted"
  | "scheduled"
  | "in_progress"
  | "completed"
  | "converted"
  | "rejected";

export type AuditRequestRow = {
  id: string;
  name: string;
  email: string;
  company: string;
  building_count: number;
  phone: string | null;
  portfolio_sqft: number | null;
  current_system: string | null;
  message: string | null;
  source: string | null;
  status: AuditRequestStatus;
  notes: string | null;
  estimated_recovery: number | null;
  assigned_to: string | null;
  organization_id: string | null;
  contacted_at: string | null;
  scheduled_at: string | null;
  completed_at: string | null;
  converted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CreateAuditRequestInput = {
  name: string;
  email: string;
  company: string;
  building_count: number;
  phone: string | null;
  portfolio_sqft: number | null;
  current_system: string | null;
  message: string | null;
  source: string | null;
  referral_code: string | null;
  status: AuditRequestStatus;
};

export type ListAuditRequestsInput = {
  statusFilter?: AuditRequestStatus;
  offset: number;
  limit: number;
};

export type UpdateAuditRequestFields = {
  status?: AuditRequestStatus;
  contacted_at?: string;
  scheduled_at?: string;
  completed_at?: string;
  converted_at?: string;
  notes?: string | null;
  estimated_recovery?: number;
  assigned_to?: string;
};

export interface AuditRequestsRepository {
  createAuditRequest(
    input: CreateAuditRequestInput,
  ): Promise<AuditRequestRow | null>;
  countRecentByEmail(email: string, windowStartIso: string): Promise<number>;
  listAuditRequests(input: ListAuditRequestsInput): Promise<AuditRequestRow[]>;
  getAuditRequestById(id: string): Promise<AuditRequestRow | null>;
  updateAuditRequest(
    id: string,
    fields: UpdateAuditRequestFields,
  ): Promise<AuditRequestRow | null>;
}
