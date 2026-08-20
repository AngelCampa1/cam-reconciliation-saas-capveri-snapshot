import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import GlossaryPage from "./page";

vi.mock("@/lib/content/pseo-data", () => ({
  getAllGlossaryTerms: vi.fn().mockResolvedValue([
    {
      slug: "cam-reconciliation",
      term: "CAM Reconciliation",
      shortDefinition: "The annual process of comparing estimated CAM charges.",
      definition:
        "CAM reconciliation is the annual process by which a landlord compares estimated Common Area Maintenance charges collected from tenants during the year against actual operating expenses incurred.",
      relatedTerms: [],
      relatedResources: [],
      category: "core-concepts",
    },
    {
      slug: "gross-up-clause",
      term: "Gross-Up Clause",
      shortDefinition: "Adjusts variable expenses to reflect full occupancy.",
      definition:
        "A gross-up clause requires landlords to adjust variable operating expenses to reflect what they would have been if the building were fully occupied.",
      relatedTerms: [],
      relatedResources: [],
      category: "calculations",
    },
    {
      slug: "pro-rata-share",
      term: "Pro-Rata Share",
      shortDefinition: "A tenant's proportionate share of operating expenses.",
      definition:
        "A tenant's pro-rata share is the fraction of total building operating expenses they are obligated to pay.",
      relatedTerms: [],
      relatedResources: [],
      category: "calculations",
    },
    {
      slug: "cam-cap",
      term: "CAM Cap",
      shortDefinition: "Limits annual increases in controllable CAM expenses.",
      definition:
        "A CAM cap limits the annual increase in controllable operating expenses a landlord can pass through to tenants.",
      relatedTerms: [],
      relatedResources: [],
      category: "lease-structures",
    },
    {
      slug: "sb-1103",
      term: "SB 1103",
      shortDefinition: "California CAM reconciliation disclosure requirements.",
      definition:
        "California SB 1103, effective January 1, 2025, extends commercial tenant protections to qualifying small commercial tenants.",
      relatedTerms: [],
      relatedResources: [],
      category: "compliance",
    },
    {
      slug: "base-building",
      term: "Base Building",
      shortDefinition:
        "Core structural and mechanical systems of the building.",
      definition:
        "Base building refers to the core structural and mechanical systems of a commercial building.",
      relatedTerms: [],
      relatedResources: [],
      category: "property-management",
    },
    {
      slug: "recovery-ratio",
      term: "Recovery Ratio",
      shortDefinition:
        "Percentage of operating expenses recovered from tenants.",
      definition:
        "The recovery ratio measures the percentage of total operating expenses a landlord actually recovers from tenants through CAM charges.",
      relatedTerms: [],
      relatedResources: [],
      category: "financial-analysis",
    },
    {
      slug: "load-factor",
      term: "Load Factor",
      shortDefinition: "Ratio of rentable to usable area.",
      definition:
        "The load factor is the ratio of a building's total rentable area to its total usable area.",
      relatedTerms: [],
      relatedResources: [],
      category: "calculations",
    },
    {
      slug: "boma-2024",
      term: "BOMA 2024",
      shortDefinition:
        "Current ANSI/BOMA standard for measuring rentable area.",
      definition:
        "BOMA 2024 is the current standard for measuring rentable area in commercial buildings.",
      relatedTerms: [],
      relatedResources: [],
      category: "compliance",
    },
    {
      slug: "nnn-lease",
      term: "NNN Lease",
      shortDefinition:
        "Triple net lease requiring tenants to pay operating costs.",
      definition:
        "A triple net lease requires tenants to pay base rent plus their proportionate share of property taxes, insurance, and common area maintenance.",
      relatedTerms: [],
      relatedResources: [],
      category: "lease-structures",
    },
  ]),
}));

describe("GlossaryPage", () => {
  it("renders an H1 heading", async () => {
    render(await GlossaryPage());
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
  });

  it("renders category section headings", async () => {
    const { container } = render(await GlossaryPage());
    const h2s = container.querySelectorAll("h2");
    expect(h2s.length).toBeGreaterThanOrEqual(2);
  });

  it("renders FAQPage structured data with curated entries", async () => {
    const { container } = render(await GlossaryPage());
    const scripts = container.querySelectorAll(
      'script[type="application/ld+json"]',
    );
    const scriptContents = Array.from(scripts).map((s) => s.textContent || "");
    const faqScript = scriptContents.find((c) => c.includes("FAQPage"));
    expect(faqScript).toBeDefined();
    const faqData = JSON.parse(faqScript!);
    expect(faqData.mainEntity.length).toBeGreaterThanOrEqual(5);
  });

  it("renders key CAM terms in the page", async () => {
    render(await GlossaryPage());
    expect(screen.getAllByText(/cam reconciliation/i).length).toBeGreaterThan(
      0,
    );
    expect(screen.getAllByText(/gross.?up/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/pro.?rata/i).length).toBeGreaterThan(0);
  });

  it("renders a back link to resources or home", async () => {
    render(await GlossaryPage());
    const links = screen.getAllByRole("link");
    const backLinks = links.filter((l) => {
      const href = l.getAttribute("href") || "";
      return href === "/" || href === "/resources" || href.includes("back");
    });
    expect(backLinks.length).toBeGreaterThan(0);
  });
});
