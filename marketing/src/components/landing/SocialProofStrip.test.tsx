import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SocialProofStrip } from "./SocialProofStrip";

describe("SocialProofStrip", () => {
  it("renders non-stat trust points", () => {
    render(<SocialProofStrip />);
    expect(
      screen.getByRole("region", { name: /capveri trust points/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/catches errors both ways/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/math you can trace/i)).toBeInTheDocument();
    expect(screen.getByText(/built on BOMA 2024/i)).toBeInTheDocument();
    expect(screen.getByText(/no new system needed/i)).toBeInTheDocument();
  });

  it("keeps trust labels out of the heading outline", () => {
    render(<SocialProofStrip />);
    // Trust-strip labels sit under the hero H1 with no section H2 between them,
    // so they must not be headings or the document outline jumps H1 -> H3.
    expect(
      screen.queryByRole("heading", { name: /catches errors both ways/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /no new system needed/i }),
    ).not.toBeInTheDocument();
  });

  it("does not render unsupported proof-style stats", () => {
    render(<SocialProofStrip />);
    expect(screen.queryByText("40%")).not.toBeInTheDocument();
    expect(screen.queryByText("$300K-$500K")).not.toBeInTheDocument();
    expect(screen.queryByText("$300K–$500K")).not.toBeInTheDocument();
    expect(screen.queryByText("28%")).not.toBeInTheDocument();
    expect(screen.queryByText("Minutes")).not.toBeInTheDocument();
  });
});
