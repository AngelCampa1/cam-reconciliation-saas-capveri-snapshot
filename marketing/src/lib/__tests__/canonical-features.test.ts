import { describe, it, expect } from "vitest";
import {
  PRODUCT_FEATURE_DOMAINS,
  SEO_FEATURE_LIST,
  getProductFeaturesByDomain,
  getProductFeaturesByTier,
} from "@/config/plans";
import { publicKnowledge } from "@/generated/public-knowledge";
import { PUBLIC_ROUTE_FEATURE_MAP } from "@/lib/structured-data";

describe("canonical product features (publicKnowledge)", () => {
  it("featureDomains is a non-empty array with id, label, and summary on each entry", () => {
    const domains = publicKnowledge.featureDomains;
    expect(Array.isArray(domains)).toBe(true);
    expect(domains.length).toBeGreaterThan(0);
    domains.forEach((d) => {
      expect(typeof d.id).toBe("string");
      expect(typeof d.label).toBe("string");
      expect(typeof d.summary).toBe("string");
    });
  });

  it("productFeatures is a non-empty array with key, name, description, domain, and tier on each entry", () => {
    const features = publicKnowledge.productFeatures;
    expect(Array.isArray(features)).toBe(true);
    expect(features.length).toBeGreaterThan(0);
    features.forEach((f) => {
      expect(typeof f.key).toBe("string");
      expect(typeof f.name).toBe("string");
      expect(typeof f.description).toBe("string");
      expect(typeof f.domain).toBe("string");
      expect(typeof f.tier).toBe("string");
    });
  });

  it("PRODUCT_FEATURE_DOMAINS re-exports featureDomains from publicKnowledge", () => {
    expect(PRODUCT_FEATURE_DOMAINS).toBe(publicKnowledge.featureDomains);
  });

  it("getProductFeaturesByDomain returns at least one feature for data-ingestion", () => {
    const results = getProductFeaturesByDomain("data-ingestion");
    expect(results.length).toBeGreaterThan(0);
    results.forEach((f) => expect(f.domain).toBe("data-ingestion"));
  });

  it("getProductFeaturesByTier('reconcile') returns only tier=reconcile features", () => {
    const results = getProductFeaturesByTier("reconcile");
    expect(results.length).toBeGreaterThan(0);
    results.forEach((f) => expect(f.tier).toBe("reconcile"));
  });

  it("canonical product features use the single Reconcile tier", () => {
    const tiers = new Set(publicKnowledge.productFeatures.map((f) => f.tier));
    expect([...tiers]).toEqual(["reconcile"]);
  });

  it("every feature key in PUBLIC_ROUTE_FEATURE_MAP exists in publicKnowledge.productFeatures", () => {
    const allKeys = new Set<string>(
      publicKnowledge.productFeatures.map((f) => f.key),
    );
    const routeKeys = Object.values(PUBLIC_ROUTE_FEATURE_MAP).flat();
    const unknown = routeKeys.filter((k) => !allKeys.has(k));
    expect(unknown).toEqual([]);
  });

  it("SEO_FEATURE_LIST is a non-empty string array", () => {
    expect(Array.isArray(SEO_FEATURE_LIST)).toBe(true);
    expect(SEO_FEATURE_LIST.length).toBeGreaterThan(0);
    SEO_FEATURE_LIST.forEach((entry) => {
      expect(typeof entry).toBe("string");
    });
  });
});
