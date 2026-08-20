import { describe, it, expect, vi } from "vitest";
import { render, act } from "@testing-library/react";
import AboutPage from "../about/page";
import ContactPage from "../contact/page";
import SampleReportPage from "../sample-report/page";
import DocumentationPage from "../docs/page";
import SourcesPage from "../sources/page";
import { metadata as homepageMetadata } from "../page";

vi.mock("@/lib/content/pseo-data", () => ({
  getVideoForPlacement: vi.fn().mockResolvedValue(null),
  getAllVideos: vi.fn().mockReturnValue([]),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({}),
  usePathname: () => "/",
}));

function getJsonLdSchemas(container: HTMLElement): Record<string, unknown>[] {
  const scripts = container.querySelectorAll(
    'script[type="application/ld+json"]',
  );
  return Array.from(scripts).map(
    (s) => JSON.parse(s.innerHTML) as Record<string, unknown>,
  );
}

function hasBreadcrumb(schemas: Record<string, unknown>[]): boolean {
  return schemas.some((s) => s["@type"] === "BreadcrumbList");
}

function hasHowTo(schemas: Record<string, unknown>[]): boolean {
  return schemas.some((s) => s["@type"] === "HowTo");
}

describe("BreadcrumbList structured data coverage", () => {
  it("renders BreadcrumbList on /about", () => {
    const { container } = render(<AboutPage />);
    expect(hasBreadcrumb(getJsonLdSchemas(container))).toBe(true);
  });

  it("renders BreadcrumbList on /contact", () => {
    const { container } = render(<ContactPage />);
    expect(hasBreadcrumb(getJsonLdSchemas(container))).toBe(true);
  });

  it("renders BreadcrumbList on /sample-report", async () => {
    let container!: HTMLElement;
    await act(async () => {
      ({ container } = render(await SampleReportPage()));
    });
    expect(hasBreadcrumb(getJsonLdSchemas(container))).toBe(true);
  });

  it("renders BreadcrumbList on /docs", () => {
    const { container } = render(<DocumentationPage />);
    expect(hasBreadcrumb(getJsonLdSchemas(container))).toBe(true);
  });

  it("renders BreadcrumbList on /sources", () => {
    const { container } = render(<SourcesPage />);
    expect(hasBreadcrumb(getJsonLdSchemas(container))).toBe(true);
  });
});

describe("HowTo structured data on /docs", () => {
  it("renders HowTo schema", () => {
    const { container } = render(<DocumentationPage />);
    expect(hasHowTo(getJsonLdSchemas(container))).toBe(true);
  });
});

describe("Homepage metadata", () => {
  it("title contains CAM keyword", () => {
    const raw = homepageMetadata.title;
    const title =
      typeof raw === "string"
        ? raw
        : ((raw as { absolute?: string })?.absolute ?? "");
    expect(title).toContain("CAM");
  });
});
