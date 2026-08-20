import { describe, it, expect } from "vitest";
import { structuredDataSchemas } from "@/lib/structured-data";

describe("structuredDataSchemas", () => {
  describe("organization", () => {
    it("has correct type, name and url", () => {
      expect(structuredDataSchemas.organization["@type"]).toBe("Organization");
      expect(structuredDataSchemas.organization.name).toBe("CapVeri.com");
      expect(structuredDataSchemas.organization.url).toBe(
        "https://www.capveri.com",
      );
    });

    it("has a contact point with email", () => {
      expect(structuredDataSchemas.organization.contactPoint["@type"]).toBe(
        "ContactPoint",
      );
      expect(structuredDataSchemas.organization.contactPoint.email).toBe(
        "angel.campa@capveri.com",
      );
    });

    it("has an @id and logo", () => {
      expect(structuredDataSchemas.organization["@id"]).toContain(
        "https://www.capveri.com",
      );
      expect(structuredDataSchemas.organization.logo).toContain("logo.svg");
    });
  });

  describe("softwareApplication", () => {
    it("has correct type and subscription offers", () => {
      expect(structuredDataSchemas.softwareApplication["@type"]).toBe(
        "SoftwareApplication",
      );
      const offers = structuredDataSchemas.softwareApplication.offers;
      expect(Array.isArray(offers)).toBe(true);
      expect(offers.length).toBe(2);
      // Free trial + Reconcile
      expect(offers[0].price).toBe("0");
      expect(offers[1].price).toBe("998.00");
    });

    it("has a non-empty featureList", () => {
      expect(
        Array.isArray(structuredDataSchemas.softwareApplication.featureList),
      ).toBe(true);
      expect(
        structuredDataSchemas.softwareApplication.featureList.length,
      ).toBeGreaterThan(0);
    });
  });

  describe("service", () => {
    it("has correct type and serviceType", () => {
      expect(structuredDataSchemas.service["@type"]).toBe("Service");
      expect(structuredDataSchemas.service.serviceType).toBe(
        "CAM Audit and Reconciliation",
      );
    });

    it("has areaServed as United States", () => {
      expect(structuredDataSchemas.service.areaServed.name).toBe(
        "United States",
      );
    });
  });

  describe("website", () => {
    it("has correct type and url", () => {
      expect(structuredDataSchemas.website["@type"]).toBe("WebSite");
      expect(structuredDataSchemas.website["@id"]).toBe(
        "https://www.capveri.com/#website",
      );
      expect(structuredDataSchemas.website.url).toBe("https://www.capveri.com");
    });

    it("does not point SearchAction schema at noindex help pages", () => {
      expect("potentialAction" in structuredDataSchemas.website).toBe(false);
    });
  });

  describe("faqPage()", () => {
    it("returns FAQPage schema with mapped questions", () => {
      const faqs = [
        { question: "What is CAM?", answer: "Common Area Maintenance." },
        { question: "What is reconciliation?", answer: "Balancing accounts." },
      ];
      const result = structuredDataSchemas.faqPage(faqs);
      expect(result["@type"]).toBe("FAQPage");
      expect(result.mainEntity).toHaveLength(2);
      expect(result.mainEntity[0]["@type"]).toBe("Question");
      expect(result.mainEntity[0].name).toBe("What is CAM?");
      expect(result.mainEntity[0].acceptedAnswer["@type"]).toBe("Answer");
      expect(result.mainEntity[0].acceptedAnswer.text).toBe(
        "Common Area Maintenance.",
      );
    });

    it("returns empty mainEntity for empty array", () => {
      const result = structuredDataSchemas.faqPage([]);
      expect(result.mainEntity).toHaveLength(0);
    });
  });

  describe("howTo()", () => {
    it("maps steps with 1-based positions", () => {
      const steps = [
        { name: "Step A", text: "Do A", url: "https://example.com/a" },
        { name: "Step B", text: "Do B" },
      ];
      const result = structuredDataSchemas.howTo("My Guide", "A guide", steps);
      expect(result["@type"]).toBe("HowTo");
      expect(result.name).toBe("My Guide");
      expect(result.description).toBe("A guide");
      expect(result.step).toHaveLength(2);
      expect(result.step[0].position).toBe(1);
      expect(result.step[0].url).toBe("https://example.com/a");
      expect(result.step[1].position).toBe(2);
      expect((result.step[1] as Record<string, unknown>).url).toBeUndefined();
    });

    it("includes totalTime when provided", () => {
      const result = structuredDataSchemas.howTo("Guide", "Desc", [], "PT30M");
      expect(result.totalTime).toBe("PT30M");
    });

    it("omits totalTime when not provided", () => {
      const result = structuredDataSchemas.howTo("Guide", "Desc", []);
      expect("totalTime" in result).toBe(false);
    });
  });

  describe("breadcrumbList()", () => {
    it("maps items with 1-based positions and prepends SITE_URL for relative paths", () => {
      const items = [
        { name: "Home", url: "/" },
        { name: "Resources", url: "/resources" },
      ];
      const result = structuredDataSchemas.breadcrumbList(items);
      expect(result["@type"]).toBe("BreadcrumbList");
      expect(result.itemListElement).toHaveLength(2);
      expect(result.itemListElement[0].position).toBe(1);
      expect(result.itemListElement[0].item).toBe("https://www.capveri.com/");
      expect(result.itemListElement[1].position).toBe(2);
      expect(result.itemListElement[1].item).toBe(
        "https://www.capveri.com/resources",
      );
    });

    it("leaves absolute URLs unchanged", () => {
      const items = [{ name: "External", url: "https://example.com/page" }];
      const result = structuredDataSchemas.breadcrumbList(items);
      expect(result.itemListElement[0].item).toBe("https://example.com/page");
    });
  });

  describe("pricingPage()", () => {
    it("includes FAQPage graph node when faqs provided", () => {
      const faqs = [{ question: "Q?", answer: "A." }];
      const result = structuredDataSchemas.pricingPage(faqs);
      const types = (result["@graph"] as Array<{ "@type": string }>).map(
        (n) => n["@type"],
      );
      expect(types).toContain("SoftwareApplication");
      expect(types).toContain("FAQPage");
    });

    it("omits FAQPage graph node when no faqs provided", () => {
      const result = structuredDataSchemas.pricingPage([]);
      const types = (result["@graph"] as Array<{ "@type": string }>).map(
        (n) => n["@type"],
      );
      expect(types).toContain("SoftwareApplication");
      expect(types).not.toContain("FAQPage");
    });

    it("includes plan offers in SoftwareApplication node", () => {
      const result = structuredDataSchemas.pricingPage([]);
      const appNode = (
        result["@graph"] as Array<{
          "@type": string;
          offers?: Array<{ availability?: string; url?: string }>;
        }>
      ).find((n) => n["@type"] === "SoftwareApplication");
      expect(appNode?.offers).toBeDefined();
      expect(appNode?.offers?.[0]).toMatchObject({
        availability: "https://schema.org/InStock",
        url: "https://www.capveri.com/pricing",
      });
    });

    it("includes a Product node with the same enriched offers", () => {
      const result = structuredDataSchemas.pricingPage([]);
      const productNode = (
        result["@graph"] as Array<{
          "@type": string;
          brand?: { "@id": string };
          offers?: Array<{ availability?: string; url?: string }>;
        }>
      ).find((n) => n["@type"] === "Product");

      expect(productNode).toMatchObject({
        "@type": "Product",
        brand: { "@id": "https://www.capveri.com/#organization" },
      });
      expect(productNode?.offers?.[0]).toMatchObject({
        availability: "https://schema.org/InStock",
        url: "https://www.capveri.com/pricing",
      });
    });
  });

  describe("article()", () => {
    it("absolutizes relative image URLs", () => {
      const result = structuredDataSchemas.article({
        headline: "Test Article",
        description: "Test description",
        url: "https://www.capveri.com/blog/test",
        datePublished: "2026-01-01",
        dateModified: "2026-01-02",
        author: { name: "Angel Campa" },
        image: "/api/og?title=Test&category=Blog",
      });

      expect(result.image?.url).toBe(
        "https://www.capveri.com/api/og?title=Test&category=Blog",
      );
    });
  });

  describe("videoObject()", () => {
    const baseParams = {
      name: "CAM Reconciliation Demo",
      description: "Upload a Yardi CSV and catch the errors.",
      youtubeId: "kCMogQ3ZJck",
      uploadDate: "2026-06-02",
      durationSeconds: 212,
      thumbnailUrl: "https://i.ytimg.com/vi/kCMogQ3ZJck/hqdefault.jpg",
    };

    it("builds a VideoObject with nocookie embed and watch URLs", () => {
      const result = structuredDataSchemas.videoObject(baseParams);
      expect(result["@type"]).toBe("VideoObject");
      expect(result.embedUrl).toBe(
        "https://www.youtube-nocookie.com/embed/kCMogQ3ZJck",
      );
      expect(result.contentUrl).toBe(
        "https://www.youtube.com/watch?v=kCMogQ3ZJck",
      );
      expect(result.thumbnailUrl).toEqual([baseParams.thumbnailUrl]);
    });

    it("formats duration as ISO 8601 from seconds", () => {
      const result = structuredDataSchemas.videoObject(baseParams);
      expect(result.duration).toBe("PT3M32S");
    });

    it("honors an explicit contentUrl override", () => {
      const result = structuredDataSchemas.videoObject({
        ...baseParams,
        contentUrl: "https://example.com/clip",
      });
      expect(result.contentUrl).toBe("https://example.com/clip");
    });
  });
});
