import { describe, it, expect } from "vitest";
import {
  AUTHOR_ANGEL_CAMPA,
  structuredDataSchemas,
} from "@/lib/structured-data";
import { SEO_FEATURE_LIST } from "@/config/plans";

describe("structured data", () => {
  it("uses SEO feature catalog entries for software application schema", () => {
    expect(structuredDataSchemas.softwareApplication.featureList).toEqual(
      SEO_FEATURE_LIST,
    );
  });

  it("softwareApplication schema includes dateModified", () => {
    expect(structuredDataSchemas.softwareApplication).toHaveProperty(
      "dateModified",
    );
    expect(typeof structuredDataSchemas.softwareApplication.dateModified).toBe(
      "string",
    );
  });

  it("service schema includes dateModified", () => {
    expect(structuredDataSchemas.service).toHaveProperty("dateModified");
    expect(typeof structuredDataSchemas.service.dateModified).toBe("string");
  });

  it("organization schema sameAs uses verified company profiles", () => {
    const { sameAs } = structuredDataSchemas.organization as {
      sameAs: readonly string[];
    };
    expect(Array.isArray(sameAs)).toBe(true);
    expect(sameAs).toEqual(["https://www.linkedin.com/company/capveri/"]);
    expect(sameAs).not.toContain("https://www.g2.com/products/capveri");
    expect(sameAs).not.toContain("https://www.capterra.com/p/capveri");
  });

  it("uses Angel Campa's canonical LinkedIn profile in Person schema", () => {
    expect(AUTHOR_ANGEL_CAMPA.sameAs).toContain(
      "https://www.linkedin.com/in/angelcampa1/",
    );
  });

  it("enriches Angel Campa article authors with the canonical founder entity", () => {
    const article = structuredDataSchemas.article({
      headline: "CAM Reconciliation Guide",
      description: "A guide to CAM reconciliation.",
      url: "https://www.capveri.com/resources/cam-reconciliation-guide",
      datePublished: "2026-01-01",
      dateModified: "2026-01-02",
      author: { name: "Angel Campa" },
    }) as { author: Record<string, unknown> };

    expect(article.author).toMatchObject({
      "@type": "Person",
      "@id": "https://www.capveri.com/about/angel-campa#person",
      name: "Angel Campa",
      jobTitle: "Founder, CapVeri",
      url: "https://www.capveri.com/about/angel-campa",
      sameAs: ["https://www.linkedin.com/in/angelcampa1/"],
    });
  });
});
