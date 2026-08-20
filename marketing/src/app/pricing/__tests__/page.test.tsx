import { describe, it, expect } from "vitest";
import { metadata } from "../page";

describe("pricing page metadata", () => {
  it("references Reconcile unit pricing in description", () => {
    expect(metadata.description).toContain("$998/year");
    expect(metadata.description).toContain("$4,990/year");
    expect(metadata.description).toContain("rentable unit");
    expect(metadata.description).toContain("80OFF");
  });

  it("references the 30-day free trial in title", () => {
    expect(metadata.title).toContain("Free Trial");
  });

  it("positions pricing for annual CAM reconciliation software", () => {
    expect(metadata.title).toContain("CAM Reconciliation Software");
    expect(metadata.description).toContain("Limited offer pricing");
    expect(metadata.description).toContain("30-day free trial");
  });
});
