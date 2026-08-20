import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import ToolsHub from "../page";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

describe("Tools hub page", () => {
  it("renders FAQPage structured data schema", () => {
    const { container } = render(<ToolsHub />);
    const scripts = container.querySelectorAll(
      'script[type="application/ld+json"]',
    );
    const scriptContents = Array.from(scripts).map((s) => s.textContent || "");
    expect(scriptContents.some((c) => c.includes("FAQPage"))).toBe(true);
  });

  it("renders all eighteen tools", () => {
    render(<ToolsHub />);
    expect(
      screen.getByText("HCAD Tax Base Year Normalizer"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("BOMA 2024 Rentable Area Calculator"),
    ).toBeInTheDocument();
    expect(screen.getByText("NOI Impact Calculator")).toBeInTheDocument();
    expect(
      screen.getByText("CAM Gross-Up Scenario Calculator"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Lease Abstract Discrepancy Matrix"),
    ).toBeInTheDocument();
    expect(screen.getByText("CAM Billing Error Estimator")).toBeInTheDocument();
    expect(
      screen.getByText("Fixed CAM vs Traditional Reconciliation Modeler"),
    ).toBeInTheDocument();
    expect(screen.getByText("Pre-Send Audit Exposure Quiz")).toBeInTheDocument();
    expect(screen.getByText("CAM Cap Calculator")).toBeInTheDocument();
    expect(screen.getByText("Pro-Rata Share Calculator")).toBeInTheDocument();
    expect(
      screen.getByText("Reconciliation Statement Template"),
    ).toBeInTheDocument();
    expect(screen.getByText("CAM Estimate Forecaster")).toBeInTheDocument();
    expect(screen.getByText("Billing Gap Analyzer")).toBeInTheDocument();
    expect(screen.getByText("Admin Fee Calculator")).toBeInTheDocument();
    expect(
      screen.getByText("Base Year Escalation Calculator"),
    ).toBeInTheDocument();
    expect(screen.getByText("SB 1103 Compliance Checker")).toBeInTheDocument();
    expect(
      screen.getByText("BOMA Remeasurement Impact Calculator"),
    ).toBeInTheDocument();
    expect(screen.getByText("Pre-Send Audit Exposure Scorecard")).toBeInTheDocument();
  });

  it("renders a freshness signal time element", () => {
    render(<ToolsHub />);
    const timeEl = screen.getByRole("time");
    expect(timeEl).toBeInTheDocument();
    expect(timeEl).toHaveAttribute("dateTime");
    expect(timeEl.textContent).toMatch(/updated/i);
  });
});
