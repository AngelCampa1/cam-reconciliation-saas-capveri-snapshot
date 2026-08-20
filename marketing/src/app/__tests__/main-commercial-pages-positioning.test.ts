import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { metadata as productTourMetadata } from "../product-tour/page";
import { metadata as solutionsMetadata } from "../solutions/page";
import { metadata as integrationsMetadata } from "../integrations/page";
import { metadata as camAuditSoftwareMetadata } from "../cam-audit-software/page";

function readMarketingSource(relativePath: string) {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

describe("main commercial page positioning", () => {
  it("positions product tour as export-based CAM reconciliation software", () => {
    expect(productTourMetadata.title).toContain("CAM Reconciliation Workflow");
    expect(productTourMetadata.description).toContain("ERP exports");
    expect(productTourMetadata.description).toContain("lease terms");
  });

  it("keeps product tour issue categories free of unsupported dollar and time claims", () => {
    const page = readMarketingSource("src/app/product-tour/page.tsx");

    expect(page).not.toContain("Typical impact");
    expect(page).not.toContain("$2,000");
    expect(page).not.toContain("$5,000");
    expect(page).not.toContain("$10,000");
    expect(page).not.toContain("$50,000");
    expect(page).not.toContain("under 15 minutes");
    expect(page).not.toContain("4-8 hours per building");
  });

  it("positions solutions around common landlord workflows", () => {
    expect(solutionsMetadata.description).toContain(
      "commercial landlords and property teams",
    );
    expect(solutionsMetadata.description).toContain("ERP exports");
  });

  it("positions integrations as supported ERP exports, not API integrations", () => {
    expect(integrationsMetadata.title).toEqual({
      absolute: "Supported ERP Exports | CapVeri CAM Reconciliation",
    });
    expect(integrationsMetadata.description).toContain(
      "standard CAM and GL exports",
    );
    expect(integrationsMetadata.description).toContain(
      "without an API integration",
    );
  });

  it("keeps CAM audit software metadata aligned to independent verification", () => {
    expect(camAuditSoftwareMetadata.description).toContain(
      "checks CAM statements before tenants see them",
    );
    expect(camAuditSoftwareMetadata.description).toContain(
      "without a new ERP integration",
    );
  });

  it("does not duplicate retired Growth pricing on the CAM audit software page", () => {
    const page = readMarketingSource("src/app/cam-audit-software/page.tsx");

    expect(page).not.toContain("Growth");
    expect(page).not.toContain("50 units included");
    expect(page).toContain("View Current Pricing");
  });
});
