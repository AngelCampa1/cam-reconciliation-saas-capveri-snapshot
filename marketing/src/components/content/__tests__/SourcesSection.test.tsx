import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SourcesSection } from "@/components/content/SourcesSection";
import type { CitationSource } from "@/lib/citations/types";

const sources: CitationSource[] = [
  {
    id: "mri-pricing",
    title: "MRI G-Cloud Pricing",
    publisher: "UK Digital Marketplace",
    publishedDate: "2025",
    url: "https://example.com/mri",
    sourcesPageAnchor: "mri-pricing",
  },
  {
    id: "yardi-interface",
    title: "Yardi Interface Partner Program",
    publisher: "Yardi",
    publishedDate: "2026",
    url: "https://example.com/yardi",
  },
];

describe("SourcesSection", () => {
  it("renders sources ordered by citation number", () => {
    render(
      <SourcesSection
        sources={sources}
        numberById={{ "yardi-interface": 1, "mri-pricing": 2 }}
      />,
    );

    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("[1]");
    expect(items[0]).toHaveTextContent("Yardi Interface Partner Program");
    expect(items[1]).toHaveTextContent("[2]");
    expect(items[1]).toHaveTextContent("MRI G-Cloud Pricing");
  });

  it("renders methodology link when anchor exists", () => {
    render(
      <SourcesSection
        sources={sources}
        numberById={{ "yardi-interface": 1, "mri-pricing": 2 }}
      />,
    );

    const methodologyLink = screen.getByRole("link", { name: /methodology/i });
    expect(methodologyLink).toHaveAttribute("href", "/sources#mri-pricing");
  });

  it("skips uncited sources that do not have a citation number", () => {
    render(
      <SourcesSection
        sources={sources}
        numberById={{ "yardi-interface": 1 }}
      />,
    );

    expect(
      screen.getByText("Yardi Interface Partner Program"),
    ).toBeInTheDocument();
    expect(screen.queryByText("MRI G-Cloud Pricing")).not.toBeInTheDocument();
  });
});
