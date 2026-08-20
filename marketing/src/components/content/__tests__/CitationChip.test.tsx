import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CitationChip } from "@/components/content/CitationChip";

describe("CitationChip", () => {
  it("renders a citation link with source number", () => {
    render(
      <CitationChip
        sourceId="yardi-interface"
        numberById={{ "yardi-interface": 2 }}
      />,
    );

    const chip = screen.getByRole("link", { name: /source 2/i });
    expect(chip).toHaveTextContent("[2]");
    expect(chip).toHaveAttribute("href", "#source-2");
  });

  it("throws if source id is missing in map", () => {
    expect(() =>
      render(<CitationChip sourceId="missing-source" numberById={{}} />),
    ).toThrow("Missing citation number for source id: missing-source");
  });
});
