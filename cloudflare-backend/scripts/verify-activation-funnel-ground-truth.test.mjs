import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  compareCounts,
  normalizePostHogResults,
  normalizeRows,
  resolvePostHogApiHost,
  validateInsightDefinition,
} from "./verify-activation-funnel-ground-truth.mjs";

describe("activation funnel ground-truth verifier", () => {
  it("uses the PostHog API host instead of the ingestion host", () => {
    assert.equal(
      resolvePostHogApiHost(null, {
        POSTHOG_HOST: "https://us.i.posthog.com",
      }),
      "https://us.posthog.com",
    );

    assert.equal(
      resolvePostHogApiHost(null, {
        POSTHOG_HOST: "https://us.i.posthog.com",
        POSTHOG_API_HOST: "https://eu.posthog.com/",
      }),
      "https://eu.posthog.com",
    );

    assert.equal(
      resolvePostHogApiHost("https://custom.posthog.com/", {}),
      "https://custom.posthog.com",
    );
  });

  it("normalizes PostHog HogQL results by event", () => {
    const rows = normalizePostHogResults({
      columns: ["event", "organization_ids"],
      results: [
        ["signup_completed", ["org-1", "org-2"]],
        ["invoice_paid", ["org-2"]],
      ],
    });

    assert.deepEqual(rows.get("signup_completed"), new Set(["org-1", "org-2"]));
    assert.deepEqual(rows.get("invoice_paid"), new Set(["org-2"]));
    assert.deepEqual(rows.get("trial_started"), new Set());
  });

  it("rejects unexpected PostHog response columns", () => {
    assert.throws(
      () =>
        normalizePostHogResults({
          columns: ["event", "count"],
          results: [["signup_completed", 1]],
        }),
      /Unexpected PostHog response columns/u,
    );
  });

  it("validates that the live insight is the org-level funnel sequence", () => {
    const insight = {
      query: {
        source: {
          kind: "FunnelsQuery",
          aggregation_group_type_index: 0,
          series: [
            { event: "signup_completed" },
            { event: "gl_import_completed" },
            { event: "reconciliation_calculation_completed" },
            { event: "reconciliation_finalized" },
            { event: "trial_started" },
            { event: "invoice_paid" },
          ],
        },
      },
    };

    assert.deepEqual(validateInsightDefinition(insight), {
      passed: true,
      mismatches: [],
      actualEvents: [
        "signup_completed",
        "gl_import_completed",
        "reconciliation_calculation_completed",
        "reconciliation_finalized",
        "trial_started",
        "invoice_paid",
      ],
    });
  });

  it("flags stale live insight event definitions", () => {
    const insight = {
      query: {
        source: {
          kind: "FunnelsQuery",
          aggregation_group_type_index: 0,
          series: [
            { event: "signup_completed" },
            { event: "gl_import_completed" },
            { event: "reconciliation_calculation_completed" },
            { event: "reconciliation_finalized" },
            { event: "trial_started" },
            { event: "subscription_started" },
          ],
        },
      },
    };

    const result = validateInsightDefinition(insight);

    assert.equal(result.passed, false);
    assert.match(result.mismatches.join("\n"), /invoice_paid/u);
  });

  it("compares missing and extra organization ids", () => {
    const databaseCounts = normalizeRows([
      { event: "signup_completed", organization_ids: ["org-1", "org-2"] },
    ]);
    const posthogCounts = normalizeRows([
      { event: "signup_completed", organization_ids: ["org-2", "org-3"] },
    ]);

    const signup = compareCounts(databaseCounts, posthogCounts).find(
      (row) => row.event === "signup_completed",
    );

    assert.deepEqual(signup, {
      event: "signup_completed",
      label: "Signup",
      dbSource: "owner_signup legal_acceptances.accepted_at",
      databaseCount: 2,
      posthogCount: 2,
      delta: 0,
      missingInPostHog: ["org-1"],
      extraInPostHog: ["org-3"],
      passed: false,
    });
  });
});
