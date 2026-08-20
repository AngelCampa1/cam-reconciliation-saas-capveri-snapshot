import type { PostgresExecutor } from "./postgres";

export const AUDIT_EVENT_ERROR_MAX_LENGTH = 2000;

export const AUDIT_PIPELINE_STAGES = [
  "extract_primary",
  "extract_sibling",
  "judge",
  "merge",
  "gap_filler",
  "validation_reprompt",
] as const;

export const AUDIT_PIPELINE_OUTCOMES = [
  "success",
  "failed",
  "fallback",
] as const;

export type AuditPipelineStage = (typeof AUDIT_PIPELINE_STAGES)[number];
export type AuditPipelineOutcome = (typeof AUDIT_PIPELINE_OUTCOMES)[number];

export type AuditPipelineEvent = {
  documentId: string;
  organizationId: string;
  stage: AuditPipelineStage;
  model: string;
  tokensUsed: number;
  durationMs: number;
  outcome: AuditPipelineOutcome;
  attemptNumber?: number;
  error?: string;
};

export type AuditPipelineEventWriteResult =
  | { ok: true }
  | { ok: false; error: Error };

export type AuditPipelineEventRepository = {
  emit(event: AuditPipelineEvent): Promise<AuditPipelineEventWriteResult>;
};

export class PostgresAuditPipelineEventRepository implements AuditPipelineEventRepository {
  constructor(private readonly executor: PostgresExecutor) {}

  async emit(
    event: AuditPipelineEvent,
  ): Promise<AuditPipelineEventWriteResult> {
    try {
      await this.executor.query(
        [
          "insert into audit_pipeline_events",
          "(document_id, organization_id, stage, model, tokens_used,",
          "duration_ms, outcome, attempt_number, error)",
          "values ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
        ].join(" "),
        [
          event.documentId,
          event.organizationId,
          event.stage,
          event.model,
          event.tokensUsed,
          event.durationMs,
          event.outcome,
          event.attemptNumber ?? 1,
          event.error ? truncateAuditEventError(event.error) : null,
        ],
      );

      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error:
          error instanceof Error
            ? error
            : new Error("Failed to emit audit pipeline event"),
      };
    }
  }
}

export function truncateAuditEventError(error: string): string {
  return error.slice(0, AUDIT_EVENT_ERROR_MAX_LENGTH);
}
