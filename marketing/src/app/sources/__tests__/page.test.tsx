import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import SourcesPage from "../page";

describe("SourcesPage", () => {
  it("renders the page heading", () => {
    render(<SourcesPage />);
    expect(
      screen.getByRole("heading", { name: /sources & research/i }),
    ).toBeInTheDocument();
  });

  it("renders industry statistics section", () => {
    render(<SourcesPage />);
    expect(
      screen.getByRole("heading", { name: /industry statistics/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/40% of CAM reconciliations contain material errors/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Attributed to Tango Analytics/i),
    ).toBeInTheDocument();
  });

  it("renders CapVeri-specific claims section", () => {
    render(<SourcesPage />);
    expect(
      screen.getByRole("heading", { name: /capveri-specific claims/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/modeled billing variance per building/i),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText(/\$35\.3k per building vs\. subscription cost/i)
        .length,
    ).toBeGreaterThan(0);
  });

  it("renders standards referenced section", () => {
    render(<SourcesPage />);
    expect(
      screen.getByRole("heading", { name: /standards referenced/i }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText(/ANSI\/BOMA Z65\.1-2024/i).length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByText(/California SB 1103/i).length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("renders methodology notes section", () => {
    render(<SourcesPage />);
    expect(
      screen.getByRole("heading", { name: /methodology notes/i }),
    ).toBeInTheDocument();
    const valueRangeMatches = screen.getAllByText(/Value Range Method/i);
    expect(valueRangeMatches.length).toBeGreaterThanOrEqual(1);
    const bviMatches = screen.getAllByText(/Building Value Impact/i);
    expect(bviMatches.length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/ROI Calculation/i)).not.toBeInTheDocument();
  });

  it("renders corrections policy with email link", () => {
    render(<SourcesPage />);
    expect(screen.getByText(/corrections policy/i)).toBeInTheDocument();
    const emailLink = screen.getByRole("link", {
      name: /angel\.campa@capveri\.com/i,
    });
    expect(emailLink).toHaveAttribute("href", "mailto:angel.campa@capveri.com");
  }, 10000);

  it("renders back link to home", () => {
    render(<SourcesPage />);
    const backLink = screen.getByText(/back to home/i);
    expect(backLink).toBeInTheDocument();
  });

  it("renders reliability ratings on industry stats", () => {
    render(<SourcesPage />);
    expect(
      screen.getAllByText(/high reliability/i).length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByText(/low reliability/i).length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("renders source verification process note", () => {
    render(<SourcesPage />);
    expect(
      screen.getByText(/Source Verification Process/i),
    ).toBeInTheDocument();
  });

  it("renders external source links where available", () => {
    render(<SourcesPage />);
    const predictapLinks = screen.getAllByText(/PredictAP blog/i);
    expect(predictapLinks.length).toBeGreaterThan(0);
    expect(
      screen.getAllByText(/Yardi Interface Program/i).length,
    ).toBeGreaterThan(0);
  });

  it("renders stable anchor ids for industry statistics", () => {
    const { container } = render(<SourcesPage />);
    const anchorNode = container.querySelector("#cam-errors-40-percent");
    expect(anchorNode).toBeInTheDocument();
  });
});
