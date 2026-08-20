import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { AppEnv } from "../env";
import { createToolsRoutes } from "../http/tools-routes";

function createTestApp() {
  const app = new Hono<{ Bindings: AppEnv }>();
  app.route("/api/v1", createToolsRoutes());
  return app;
}

describe("tools routes", () => {
  it("calculates BOMA 2024 rentable area impact", async () => {
    const response = await createTestApp().request(
      "/api/v1/tools/boma-2024-calculator",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          usable_sf: "100000",
          rentable_sf: "125000",
          balcony_sf: "1000",
          terrace_sf: "2000",
          outdoor_amenity_sf: "1000",
          annual_rent_per_sf: "35",
          cap_rate: "0.065",
        }),
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      load_factor: "1.2500",
      new_usable_sf: "104000.00",
      new_rentable_sf: "130000.00",
      hidden_sf: "5000.00",
      pct_increase: "4.0000",
      revenue_lift: "175000.00",
      asset_value_lift: "2692308",
    });
  });

  it("returns BOMA SF geometry with null financials when rent is omitted", async () => {
    const response = await createTestApp().request(
      "/api/v1/tools/boma-2024-calculator",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          usable_sf: "100000",
          rentable_sf: "125000",
          balcony_sf: "1000",
          terrace_sf: "2000",
          outdoor_amenity_sf: "1000",
        }),
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      load_factor: "1.2500",
      new_usable_sf: "104000.00",
      new_rentable_sf: "130000.00",
      hidden_sf: "5000.00",
      pct_increase: "4.0000",
      revenue_lift: null,
      asset_value_lift: null,
    });
  });

  it("calculates HCAD tax normalization with optional cap", async () => {
    const response = await createTestApp().request(
      "/api/v1/tools/hcad-tax-normalizer/calculate",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          original_base_year_assessment: "1200000",
          retroactive_adjustment: "150000",
          current_year_tax: "1350000",
          pro_rata_pct: "0.0525",
          cap_rate: "0.05",
        }),
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      adjusted_base_year: "1050000.00",
      original_passthrough: "7875.00",
      corrected_passthrough: "15750.00",
      recovery_delta: "7875.00",
      capped_corrected_passthrough: "8268.75",
      capped_recovery: "393.75",
      cap_was_applied: true,
    });
  });

  it("models fixed CAM versus traditional recovery", async () => {
    const response = await createTestApp().request(
      "/api/v1/tools/fixed-cam-modeler",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          years: [
            {
              year: 2024,
              total_operating_expenses: "1000000",
              rentable_sf: "100000",
            },
            {
              year: 2025,
              total_operating_expenses: "1100000",
              rentable_sf: "100000",
            },
            {
              year: 2026,
              total_operating_expenses: "1200000",
              rentable_sf: "100000",
            },
          ],
          fixed_cam_rate_per_sf: "8.50",
          annual_escalation_pct: "3",
          tenant_sqft: "5000",
          pro_rata_share: "5",
        }),
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      years: [
        {
          year: 2024,
          total_operating_expenses: "1000000.00",
          expense_per_sf: "10.00",
          traditional_recovery: "50000.00",
          fixed_cam_revenue: "42500.00",
          delta: "7500.00",
          cumulative_delta: "7500.00",
          escalated_rate_per_sf: "8.50",
        },
        {
          year: 2025,
          total_operating_expenses: "1100000.00",
          expense_per_sf: "11.00",
          traditional_recovery: "55000.00",
          fixed_cam_revenue: "43775.00",
          delta: "11225.00",
          cumulative_delta: "18725.00",
          escalated_rate_per_sf: "8.76",
        },
        {
          year: 2026,
          total_operating_expenses: "1200000.00",
          expense_per_sf: "12.00",
          traditional_recovery: "60000.00",
          fixed_cam_revenue: "45088.25",
          delta: "14911.75",
          cumulative_delta: "33636.75",
          escalated_rate_per_sf: "9.02",
        },
      ],
      total_traditional_recovery: "165000.00",
      total_fixed_cam_revenue: "131363.25",
      total_delta: "33636.75",
      avg_annual_delta: "11212.25",
    });
  });

  it("returns 422 for invalid public calculator input", async () => {
    const response = await createTestApp().request(
      "/api/v1/tools/boma-2024-calculator",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          usable_sf: "100000",
          rentable_sf: "90000",
          annual_rent_per_sf: "35",
        }),
      },
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "invalid_tool_input" },
    });
  });

  it.each([
    "/api/v1/tools/boma-2024-calculator",
    "/api/v1/tools/hcad-tax-normalizer/calculate",
    "/api/v1/tools/fixed-cam-modeler",
  ])("returns 400 for malformed JSON on %s", async (path) => {
    const response = await createTestApp().request(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{ not valid json",
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "invalid_json" },
    });
  });
});
