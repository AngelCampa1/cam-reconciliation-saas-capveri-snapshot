import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { StatGrid } from "../StatGrid";

const SAMPLE_STATS = [
  {
    value: "$25K",
    caption: "Average uncollected CAM per building per year",
    source: "BOMA industry data",
  },
  {
    value: "28%",
    caption: "Tenants who find CAM discrepancies without hiring an auditor",
    source: "BOMA industry data",
  },
  {
    value: "$300K–$500K",
    caption: "Annual leakage across a typical mid-size portfolio",
    source: "BOMA industry data",
  },
];

describe("StatGrid", () => {
  it("renders each stat value", () => {
    render(<StatGrid stats={SAMPLE_STATS} />);
    expect(screen.getByText("$25K")).toBeInTheDocument();
    expect(screen.getByText("28%")).toBeInTheDocument();
    expect(screen.getByText("$300K–$500K")).toBeInTheDocument();
  });

  it("renders each stat caption", () => {
    render(<StatGrid stats={SAMPLE_STATS} />);
    expect(
      screen.getByText("Average uncollected CAM per building per year"),
    ).toBeInTheDocument();
  });

  it("renders source attribution text", () => {
    render(<StatGrid stats={SAMPLE_STATS} />);
    const sourceLabels = screen.getAllByText("BOMA industry data");
    expect(sourceLabels.length).toBe(3);
  });

  it("renders one card per stat entry", () => {
    const { container } = render(<StatGrid stats={SAMPLE_STATS} />);
    const cards = container.querySelectorAll("[data-stat-card]");
    expect(cards.length).toBe(3);
  });
});
