import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ValuePropositionSection } from "../ValuePropositionSection";

describe("ValuePropositionSection", () => {
  it("states the homepage problem plainly", () => {
    render(<ValuePropositionSection />);
    expect(
      screen.getByRole("heading", {
        name: /cam closeout is too important for spreadsheets/i,
      }),
    ).toBeInTheDocument();
  });

  it("renders the replacement-free, deterministic, and review value props", () => {
    render(<ValuePropositionSection />);
    expect(
      screen.getByText(/close cam without rebuilding your stack/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/get every cam number right/i)).toBeInTheDocument();
    expect(
      screen.getByText(/your statement matches the lease, line by line/i),
    ).toBeInTheDocument();
  });
});
