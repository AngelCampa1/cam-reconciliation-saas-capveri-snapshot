import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FeaturesGrid } from "../FeaturesGrid";

describe("FeaturesGrid", () => {
  it("renders workflow-focused heading and subheading", () => {
    render(<FeaturesGrid />);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      /built for the reconciliation workflow/i,
    );
    expect(
      screen.getByText(
        /from raw export files to tenant statements\s+you can defend/i,
      ),
    ).toBeInTheDocument();
  });

  it("renders concrete reconciliation features", () => {
    render(<FeaturesGrid />);
    expect(screen.getByText("ERP export ingestion")).toBeInTheDocument();
    expect(screen.getByText("Lease-term mapping")).toBeInTheDocument();
    expect(screen.getByText("Deterministic CAM engine")).toBeInTheDocument();
    expect(screen.getByText("Exception review")).toBeInTheDocument();
    expect(screen.getByText("Tenant-ready exports")).toBeInTheDocument();
    expect(screen.getByText("Audit trail")).toBeInTheDocument();
  });
});
