/**
 * Repository interface for cross-document analysis.
 */

import type {
  AuditorContext,
  CrossDocAnalysisInput,
  CrossDocAnalysisRow,
  FindingDecisionRecord,
  PropertyAuditorOverrides,
} from "./types";

export type AssembleInput = {
  propertyId: string;
  periodYear: number;
  organizationId: string;
};

export type SaveAnalysisInput = {
  organizationId: string;
  propertyId: string;
  periodYear: number;
  result: {
    findings: Record<string, unknown>;
    token_usage: number;
  };
};

export type UpdateFindingDecisionInput = {
  analysisId: string;
  findingId: string;
  organizationId: string;
  decision: FindingDecisionRecord;
};

export type UpdateAuditorConfigInput = {
  organizationId: string;
  config: AuditorContext;
};

export type UpdateAuditorOverridesInput = {
  propertyId: string;
  organizationId: string;
  overrides: PropertyAuditorOverrides;
};

export interface CrossDocAnalysisRepository {
  hasFullAccess(organizationId: string): Promise<boolean>;

  /** Returns null if property not in org */
  checkPropertyInOrg(input: {
    propertyId: string;
    organizationId: string;
  }): Promise<boolean>;

  /** Returns null if analysis not found */
  getAnalysisOrgId(input: {
    analysisId: string;
  }): Promise<{ organization_id: string } | null>;

  getLatestAnalysis(input: {
    propertyId: string;
    periodYear: number;
    organizationId: string;
  }): Promise<CrossDocAnalysisRow | null>;

  /** Returns the new analysis id */
  insertAnalysis(input: SaveAnalysisInput): Promise<string>;

  /**
   * Atomically merge a finding decision.
   * Returns merged decisions map (null if analysis not found).
   */
  mergeFindingDecision(
    input: UpdateFindingDecisionInput,
  ): Promise<Record<string, Record<string, unknown>> | null>;

  /**
   * Update analysis status (pending→in_review or →reviewed).
   */
  updateAnalysisStatus(input: {
    analysisId: string;
    organizationId: string;
    status: "in_review" | "reviewed";
    expectedStatus?: "pending" | "in_review";
  }): Promise<boolean>;

  getAnalysisForStatus(input: {
    analysisId: string;
    organizationId: string;
  }): Promise<{ findings: Record<string, unknown>; status: string } | null>;

  updateOrgAuditorConfig(input: UpdateAuditorConfigInput): Promise<void>;

  updatePropertyAuditorOverrides(
    input: UpdateAuditorOverridesInput,
  ): Promise<void>;

  assembleCrossDocInput(input: AssembleInput): Promise<CrossDocAnalysisInput>;
}
