import { env as workerEnv } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { createOpenRouterClient } from "../adapters/ai/openrouter";
import { runCrossDocAnalysis } from "../domain/cross-doc-analysis/orchestrator";
import type {
  CrossDocAnalysisRepository,
  SaveAnalysisInput,
} from "../domain/cross-doc-analysis/repository";
import type {
  CrossDocAnalysisInput,
  CrossDocAnalysisRow,
  TermOverrideSuggestion,
} from "../domain/cross-doc-analysis/types";
import { createExtractionModelConfig } from "../domain/extraction/model-config";
import type { AppEnv } from "../env";

type OpenRouterE2EEnv = Partial<AppEnv> & {
  RUN_OPENROUTER_E2E?: string;
  CI?: string;
};

const runtimeEnv = workerEnv as OpenRouterE2EEnv;
const realOpenRouterRequested =
  runtimeEnv.RUN_OPENROUTER_E2E === "1" ||
  process.env.RUN_OPENROUTER_E2E === "1";
const isCi =
  runtimeEnv.CI === "1" ||
  runtimeEnv.CI === "true" ||
  process.env.CI === "1" ||
  process.env.CI === "true";
if (realOpenRouterRequested && isCi) {
  throw new Error("RUN_OPENROUTER_E2E is local-only and must not run in CI.");
}
const runRealOpenRouter = realOpenRouterRequested && !isCi;

const organizationId = "11111111-1111-4111-8111-111111111111";
const propertyId = "22222222-2222-4222-8222-222222222222";
const leaseId = "33333333-3333-4333-8333-333333333333";

class MemoryCrossDocRepository implements CrossDocAnalysisRepository {
  inserted: SaveAnalysisInput | null = null;

  async hasFullAccess(): Promise<boolean> {
    return true;
  }

  async checkPropertyInOrg(): Promise<boolean> {
    return true;
  }

  async getAnalysisOrgId(): Promise<{ organization_id: string } | null> {
    return { organization_id: organizationId };
  }

  async getLatestAnalysis(): Promise<CrossDocAnalysisRow | null> {
    return null;
  }

  async insertAnalysis(input: SaveAnalysisInput): Promise<string> {
    this.inserted = input;
    return "44444444-4444-4444-8444-444444444444";
  }

  async mergeFindingDecision(): Promise<
    Record<string, Record<string, unknown>>
  > {
    return {};
  }

  async updateAnalysisStatus(): Promise<boolean> {
    return true;
  }

  async getAnalysisForStatus(): Promise<{
    findings: Record<string, unknown>;
    status: string;
  } | null> {
    return null;
  }

  async updateOrgAuditorConfig(): Promise<void> {}

  async updatePropertyAuditorOverrides(): Promise<void> {}

  async assembleCrossDocInput(): Promise<CrossDocAnalysisInput> {
    return amendmentPackageInput();
  }
}

describe.skipIf(!runRealOpenRouter)(
  "real OpenRouter Worker cross-document analysis E2E",
  () => {
    it("suggests latest pro-rata and cap amendment overrides and persists analysis", async () => {
      const repository = new MemoryCrossDocRepository();
      const result = await runCrossDocAnalysis(
        repository,
        createOpenRouterClient(runtimeEnv),
        createExtractionModelConfig(runtimeEnv).crossDoc,
        {
          propertyId,
          periodYear: 2024,
          organizationId,
        },
      );

      const proRataOverrides = collectOverrides(result, "pro_rata_share");
      const capTypeOverrides = collectOverrides(result, "cap_type");
      const capRateOverrides = collectOverrides(result, "cap_rate");

      expect(result.token_usage).toBeGreaterThan(0);
      expect(result.documents_analyzed.leases ?? 0).toBeGreaterThanOrEqual(1);
      expect(result.overall_risk_score).toBeGreaterThan(0);
      expect(repository.inserted).not.toBeNull();
      expect(repository.inserted!.result.token_usage).toBe(result.token_usage);
      expectReviewableFindingEvidence(result.findings);
      expect(
        proRataOverrides.length,
        JSON.stringify(result, null, 2),
      ).toBeGreaterThan(0);
      expect(
        proRataOverrides.some(
          (override) => decimalValue(override.suggested_value) === 0.075,
        ),
      ).toBe(true);
      expect(
        proRataOverrides.some((override) => override.confidence >= 70),
      ).toBe(true);
      expect(
        capTypeOverrides.some(
          (override) => override.suggested_value === "non_cumulative",
        ),
        JSON.stringify(result, null, 2),
      ).toBe(true);
      expect(
        capTypeOverrides.some((override) => override.confidence >= 70),
      ).toBe(true);
      expect(
        capRateOverrides.some(
          (override) => decimalValue(override.suggested_value) === 0.04,
        ),
        JSON.stringify(result, null, 2),
      ).toBe(true);
      expect(
        capRateOverrides.some((override) => override.confidence >= 70),
      ).toBe(true);
    }, 240_000);
  },
);

describe("real OpenRouter Worker cross-doc E2E harness", () => {
  it("keeps the synthetic package fixture focused on latest side-letter precedence", () => {
    const input = amendmentPackageInput();
    expect(input.data_availability.has_verified_leases).toBe(true);
    expect(input.lease_contexts).toHaveLength(1);
    expect(input.lease_contexts[0]!.pro_rata_share).toBe("0.1250");
    expect(JSON.stringify(input.lease_contexts[0]!.recovery_profile)).toContain(
      "Tenant's pro-rata share shall be 7.50%",
    );
    expect(JSON.stringify(input.lease_contexts[0]!.recovery_profile)).toContain(
      "no banking, carryforward, or compounding",
    );
  });
});

function amendmentPackageInput(): CrossDocAnalysisInput {
  return {
    property_id: propertyId,
    property_name: "Stella Link Amendment Package",
    period_year: 2024,
    lease_contexts: [
      {
        lease_id: leaseId,
        tenant_name: "Amendment Package Tenant",
        recovery_profile: {
          current_extracted_terms: {
            pro_rata_share: "0.1250",
            cap_type: "cumulative",
            cap_rate: "0.06",
          },
          source_documents_in_chronological_order: [
            {
              date: "2021-01-01",
              name: "Original Lease",
              text:
                "Tenant pays 12.50% of Operating Expenses. " +
                "Annual controllable expense increases are capped at a cumulative six percent per year.",
            },
            {
              date: "2023-04-15",
              name: "Tenant Estoppel",
              text:
                "The estoppel repeats the original 12.50% pro-rata share " +
                "but does not amend the lease.",
            },
            {
              date: "2023-05-10",
              name: "First Amendment - Controllable Expense Cap",
              text:
                "Effective January 1, 2024, the prior cumulative six percent cap is deleted. " +
                "Controllable operating expenses are capped separately each year at four percent, " +
                "with no banking, carryforward, or compounding of unused capacity.",
            },
            {
              date: "2023-06-01",
              name: "Second Amendment and Side Letter",
              text:
                "Effective January 1, 2024, Tenant's rentable area is reduced. " +
                "Tenant's pro-rata share shall be 7.50%. " +
                "This side letter supersedes all conflicting prior statements, estoppels, and lease schedules.",
            },
          ],
        },
        pro_rata_share: "0.1250",
        base_year: 2021,
        term_start: "2021-01-01",
        term_end: "2029-12-31",
        verified_at: "2024-12-20T12:00:00Z",
      },
    ],
    gl_pool_contexts: [
      {
        pool_name: "Operating Expenses",
        pool_type: "operating",
        total_amount: "400000.00",
        account_count: 12,
        top_vendors: ["Metro Services"],
        is_gross_up_applicable: false,
      },
    ],
    auditor_context: {
      market: "Houston",
      typical_management_fee_pct: null,
      known_vendor_patterns: [],
      custom_rules: [
        "When a dated side letter supersedes prior lease schedules, use the latest contractual share.",
        "When an amendment deletes banking or carryforward, classify the cap as non_cumulative.",
      ],
    },
    property_overrides: {
      known_exceptions: [],
      special_instructions: [],
      suppressed_finding_categories: [],
    },
    prior_year_totals: { "Operating Expenses": "360000.00" },
    data_availability: {
      has_verified_leases: true,
      has_gl_data: true,
      has_cam_statements: false,
      has_prior_year_data: true,
      lease_count: 1,
      gl_account_count: 12,
    },
    estimated_tokens: 1800,
  };
}

function collectOverrides(
  result: {
    findings: Array<{ override_suggestion: TermOverrideSuggestion | null }>;
    lease_term_overrides: TermOverrideSuggestion[];
  },
  fieldName: string,
): TermOverrideSuggestion[] {
  const inline = result.findings
    .map((finding) => finding.override_suggestion)
    .filter((override): override is TermOverrideSuggestion => {
      return (
        override !== null &&
        override.lease_id === leaseId &&
        override.field_name === fieldName
      );
    });
  const topLevel = result.lease_term_overrides.filter((override) => {
    return override.lease_id === leaseId && override.field_name === fieldName;
  });
  return [...topLevel, ...inline];
}

function expectReviewableFindingEvidence(
  findings: Array<{
    severity: string;
    title: string;
    detail: string;
    source_documents: string[];
    financial_impact_estimate: string | null;
    override_suggestion: TermOverrideSuggestion | null;
  }>,
) {
  expect(findings.length).toBeGreaterThan(0);
  const reviewable = findings.find((finding) => {
    const impact =
      finding.financial_impact_estimate === null
        ? null
        : Number(finding.financial_impact_estimate);
    return (
      ["info", "warning", "critical"].includes(finding.severity) &&
      finding.title.trim().length >= 8 &&
      finding.detail.trim().length >= 20 &&
      finding.source_documents.length > 0 &&
      finding.source_documents.some((source) => source.trim().length >= 8) &&
      impact !== null &&
      Number.isFinite(impact) &&
      (finding.override_suggestion === null ||
        (typeof finding.override_suggestion.reasoning === "string" &&
          finding.override_suggestion.reasoning.trim().length >= 20 &&
          finding.override_suggestion.confidence >= 0 &&
          finding.override_suggestion.confidence <= 100))
    );
  });
  expect(
    reviewable,
    `Expected at least one reviewable finding with source documents and numeric financial impact: ${JSON.stringify(findings, null, 2)}`,
  ).toBeDefined();
}

function decimalValue(value: unknown): number | null {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim().replace(/[$,]/gu, "");
  const percentMatch = trimmed.match(/^(-?\d+(?:\.\d+)?)%$/u);
  if (percentMatch?.[1]) {
    return Number(percentMatch[1]) / 100;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}
