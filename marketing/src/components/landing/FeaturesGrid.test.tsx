import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { FeaturesGrid } from "./FeaturesGrid";

describe("FeaturesGrid", () => {
  it("renders current workflow heading", () => {
    render(<FeaturesGrid />);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      /built for the reconciliation workflow/i,
    );
  });

  it("renders the six workflow feature cards", () => {
    render(<FeaturesGrid />);
    const cardHeadings = screen.getAllByRole("heading", { level: 3 });
    expect(cardHeadings).toHaveLength(6);
    expect(screen.getByText("ERP export ingestion")).toBeInTheDocument();
    expect(screen.getByText("Lease-term mapping")).toBeInTheDocument();
    expect(screen.getByText("Deterministic CAM engine")).toBeInTheDocument();
    expect(screen.getByText("Exception review")).toBeInTheDocument();
    expect(screen.getByText("Tenant-ready exports")).toBeInTheDocument();
    expect(screen.getByText("Audit trail")).toBeInTheDocument();
  });

  it("does not render old catalog metrics or compliance badges", () => {
    render(<FeaturesGrid />);
    expect(
      screen.queryByText("Deterministic calculation engine"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("SB 1103 and demand letter workflows"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("BOMA 2024")).not.toBeInTheDocument();
    expect(screen.queryByText("SB 1103")).not.toBeInTheDocument();
  });
});
