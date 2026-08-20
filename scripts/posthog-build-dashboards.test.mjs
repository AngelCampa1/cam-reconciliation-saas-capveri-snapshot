import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DASHBOARDS,
  resolvePostHogApiHost,
} from "./posthog-build-dashboards.mjs";

describe("posthog dashboard builder host resolution", () => {
  it("uses the PostHog app API host instead of the ingest host", () => {
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
});

describe("posthog dashboard definitions", () => {
  it("measures free-tool lead capture after the user sees a result", () => {
    const marketingDashboard = DASHBOARDS.find((dashboard) =>
      dashboard.name.includes("Marketing"),
    );
    assert.ok(marketingDashboard);

    const insight = marketingDashboard.insights.find(
      (item) => item.name === "Tool result -> lead conversion (by tool)",
    );
    assert.ok(insight);

    const source = insight.query.source;
    assert.equal(source.kind, "FunnelsQuery");
    assert.equal(source.funnelsFilter.funnelWindowInterval, 7);
    assert.deepEqual(
      source.series.map((item) => item.event),
      ["tool_result_viewed", "lead_form_view", "lead_form_submit"],
    );
    assert.deepEqual(
      source.series.map((item) => item.custom_name),
      ["Result viewed", "Form viewed", "Lead submitted"],
    );
    assert.deepEqual(source.breakdownFilter, {
      breakdown: "slug",
      breakdown_type: "person",
    });
  });

  it("builds a PLG onboarding step drop-off funnel from transition events", () => {
    const productDashboard = DASHBOARDS.find(
      (dashboard) => dashboard.name.includes("Product Decisions"),
    );
    assert.ok(productDashboard);

    const insight = productDashboard.insights.find(
      (item) => item.name === "Onboarding step drop-off: PLG real-data flow",
    );
    assert.ok(insight);

    const source = insight.query.source;
    assert.equal(source.kind, "FunnelsQuery");
    assert.equal(source.funnelsFilter.funnelWindowInterval, 7);

    const series = source.series;
    assert.equal(series.length, 7);
    assert.deepEqual(
      series.map((item) => item.event),
      Array.from({ length: 7 }, () => "onboard_step_transitioned"),
    );
    assert.deepEqual(
      series.map((item) => item.custom_name),
      [
        "1. Building",
        "2. Tenants",
        "3. Costs",
        "4. Charges",
        "5. Results",
        "6. Email",
        "7. Password",
      ],
    );

    series.forEach((item, index) => {
      assert.deepEqual(item.properties, [
        {
          key: "flow_id",
          value: "plg_onboarding",
          operator: "exact",
          type: "event",
        },
        {
          key: "flow_mode",
          value: "plg",
          operator: "exact",
          type: "event",
        },
        {
          key: "step",
          value: index + 1,
          operator: "exact",
          type: "event",
        },
      ]);
    });
  });
});
