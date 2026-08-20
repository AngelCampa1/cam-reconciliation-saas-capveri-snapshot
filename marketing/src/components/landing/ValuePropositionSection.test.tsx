import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ValuePropositionSection } from "./ValuePropositionSection";

describe("ValuePropositionSection", () => {
  it("renders the current problem statement", () => {
    render(<ValuePropositionSection />);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      /cam closeout is too important for spreadsheets/i,
    );
  });

  it("renders exactly 3 non-stat value prop cards", () => {
    render(<ValuePropositionSection />);
    const cardHeadings = screen.getAllByRole("heading", { level: 3 });
    expect(cardHeadings).toHaveLength(3);
    expect(
      screen.getByRole("heading", {
        name: /close cam without rebuilding your stack/i,
        level: 3,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: /get every cam number right/i,
        level: 3,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: /your statement matches the lease, line by line/i,
        level: 3,
      }),
    ).toBeInTheDocument();
  });

  it("does not render old metric-heavy value prop claims", () => {
    render(<ValuePropositionSection />);
    expect(
      screen.queryByText(/demand letters & dispute resolution/i),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("28%")).not.toBeInTheDocument();
    expect(
      screen.queryByText(/yardi charges per api/i),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/modeled range per building/i),
    ).not.toBeInTheDocument();
  });
});
