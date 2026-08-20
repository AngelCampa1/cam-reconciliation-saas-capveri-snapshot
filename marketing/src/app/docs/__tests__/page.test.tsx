import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import DocumentationPage from "../page";

describe("Documentation page", () => {
  it("renders all catalog domain cards", () => {
    render(<DocumentationPage />);
    expect(screen.getByText("Data ingestion")).toBeInTheDocument();
    expect(screen.getByText("Calculation engine")).toBeInTheDocument();
    expect(screen.getByText("Lease management")).toBeInTheDocument();
    expect(screen.getByText("Reconciliation workflow")).toBeInTheDocument();
    expect(screen.getByText("Tenant portal")).toBeInTheDocument();
    expect(screen.getByText("Compliance and legal")).toBeInTheDocument();
    expect(screen.getByText("Exports and reporting")).toBeInTheDocument();
    expect(screen.getByText("Billing and subscriptions")).toBeInTheDocument();
    expect(screen.getByText("Platform and security")).toBeInTheDocument();
  });
});
