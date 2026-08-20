import { render, screen, act, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import ComparisonHubPage from "../page";
import ComparisonPage from "../[slug]/page";
import type { ComparisonData } from "@/lib/content/pseo-types";

vi.mock("@/lib/content/pseo-data", () => ({
  getAllComparisons: vi.fn(),
  getComparison: vi.fn(),
  getVideoForPlacement: vi.fn().mockResolvedValue(null),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
  }: {
    href: string;
    children: React.ReactNode;
  }) => <a href={href}>{children}</a>,
}));

function makeComparison(
  slug: string,
  competitorName: string,
  headline: string,
): ComparisonData {
  return {
    slug,
    competitorName,
    competitorShortName: competitorName,
    headline,
    winnerLabel: "CapVeri",
    winnerSummary: `CapVeri wins for ${competitorName} teams that need CAM verification before tenant packages go out.`,
    bestForCapveri: `Best for ${competitorName} users who need an independent CAM verification layer.`,
    bestForCompetitor: `Best for teams that need ${competitorName} as the accounting system of record.`,
    metaTitle: "",
    metaDescription: "",
    datePublished: "2026-01-01",
    dateModified: "2026-01-01",
    competitorDefinition: "",
    capveriDefinition: "",
    introParagraphs: [],
    strengths: { heading: "", paragraphs: [] },
    painPoints: { heading: "", items: [] },
    comparisonTable: { columns: [], rows: [] },
    antiIntegration: { heading: "", paragraphs: [] },
    faqs: [],
    relatedComparisons: [],
    relatedResources: [],
    ctaHeading: "",
    ctaDescription: "",
  };
}

const mockComparisons: ComparisonData[] = [
  makeComparison("yardi", "Yardi", "CapVeri vs Yardi"),
  makeComparison("mri", "MRI Software", "CapVeri vs MRI Software"),
  makeComparison("appfolio", "AppFolio", "CapVeri vs AppFolio"),
  makeComparison("buildium", "Buildium", "CapVeri vs Buildium"),
  makeComparison("sage-intacct", "Sage Intacct", "CapVeri vs Sage Intacct"),
];

// Import the mock after vi.mock so we can configure it
import { getAllComparisons, getComparison } from "@/lib/content/pseo-data";
const mockedGetAllComparisons = vi.mocked(getAllComparisons);
const mockedGetComparison = vi.mocked(getComparison);

beforeEach(() => {
  mockedGetAllComparisons.mockResolvedValue(mockComparisons);
  mockedGetComparison.mockResolvedValue(mockComparisons[0]);
});

describe("ComparisonHubPage", () => {
  it("renders the page heading", async () => {
    await act(async () => {
      render(await ComparisonHubPage());
    });
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
  });

  it("links to all comparison pages", async () => {
    await act(async () => {
      render(await ComparisonHubPage());
    });
    const links = screen.getAllByRole("link");
    const hrefs = links.map((l) => l.getAttribute("href"));
    expect(hrefs).toContain("/vs/yardi");
    expect(hrefs).toContain("/vs/mri");
    expect(hrefs).toContain("/vs/appfolio");
    expect(hrefs).toContain("/vs/buildium");
    expect(hrefs).toContain("/vs/sage-intacct");
  });

  it("renders comparison titles", async () => {
    await act(async () => {
      render(await ComparisonHubPage());
    });
    expect(screen.getByText("CapVeri vs Yardi")).toBeInTheDocument();
    expect(screen.getByText("CapVeri vs MRI Software")).toBeInTheDocument();
    expect(screen.getByText("CapVeri vs AppFolio")).toBeInTheDocument();
    expect(screen.getByText("CapVeri vs Buildium")).toBeInTheDocument();
    expect(screen.getByText("CapVeri vs Sage Intacct")).toBeInTheDocument();
  });

  it("renders winner verdict snippets on comparison cards", async () => {
    await act(async () => {
      render(await ComparisonHubPage());
    });

    expect(screen.getAllByText("Winner: CapVeri")).toHaveLength(5);
    expect(
      screen.getByText(
        "CapVeri wins for Yardi teams that need CAM verification before tenant packages go out.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Best for Yardi users who need an independent CAM verification layer.",
      ),
    ).toBeInTheDocument();
  });

  it("renders structured data (ItemList + BreadcrumbList)", async () => {
    let container: HTMLElement;
    await act(async () => {
      ({ container } = render(await ComparisonHubPage()));
    });
    const scripts = container!.querySelectorAll(
      'script[type="application/ld+json"]',
    );
    expect(scripts.length).toBeGreaterThanOrEqual(2);

    const scriptContents = Array.from(scripts).map((s) => s.textContent || "");
    expect(scriptContents.some((c) => c.includes("ItemList"))).toBe(true);
    expect(scriptContents.some((c) => c.includes("BreadcrumbList"))).toBe(true);
  });

  it("renders independent verification positioning in description", async () => {
    await act(async () => {
      render(await ComparisonHubPage());
    });
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: /independent cam verification/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/works alongside yardi/i)).toBeInTheDocument();
  });

  it("compares approach categories without unsupported competitor assertions", async () => {
    await act(async () => {
      render(await ComparisonHubPage());
    });

    // These column headers appear in both the desktop <th> and mobile <dt> elements;
    // scope to the table to avoid the "multiple elements found" error from JSDOM
    // rendering both variants (CSS media queries are ignored in JSDOM).
    const table = screen.getByRole("table");
    expect(
      within(table).getByText("CapVeri export verification"),
    ).toBeInTheDocument();
    expect(
      within(table).getByText("Existing ERP workflow"),
    ).toBeInTheDocument();
    expect(
      within(table).getByText("Manual spreadsheet review"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("ERP Replacement Required"),
    ).not.toBeInTheDocument();
  });

  it("renders back link to home", async () => {
    await act(async () => {
      render(await ComparisonHubPage());
    });
    expect(screen.getByText(/back to home/i)).toBeInTheDocument();
  });
});

describe("ComparisonPage", () => {
  it("renders the comparison verdict block", async () => {
    await act(async () => {
      render(
        await ComparisonPage({ params: Promise.resolve({ slug: "yardi" }) }),
      );
    });

    expect(screen.getByText("Winner: CapVeri")).toBeInTheDocument();
    expect(
      screen.getByText(
        "CapVeri wins for Yardi teams that need CAM verification before tenant packages go out.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Best for Yardi users who need an independent CAM verification layer.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Best for teams that need Yardi as the accounting system of record.",
      ),
    ).toBeInTheDocument();
  });
});
