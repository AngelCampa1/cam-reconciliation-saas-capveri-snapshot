import { describe, expect, it, vi } from "vitest";
import { generateStaticParams } from "./page";

vi.mock("@/lib/content/pseo-data", () => ({
  getAllGlossaryTerms: vi.fn().mockResolvedValue([
    {
      slug: "gross-up-clause",
      term: "Gross-Up Clause",
      shortDefinition: "Adjusts variable expenses to normalized occupancy.",
      definition:
        "A gross-up clause normalizes variable operating expenses for occupancy.",
      relatedTerms: [],
      relatedResources: [],
      category: "calculations",
    },
  ]),
  getGlossaryTerm: vi.fn(),
}));

vi.mock("@/lib/seo/content-governance", () => ({
  RETAINED_GLOSSARY_TERM_SLUGS: ["gross-up-clause"],
  filterByRetainedSlugs: vi.fn((terms) => terms),
}));

describe("GlossaryTermPage static params", () => {
  it("includes legacy gross-up alias so production redirects instead of 404ing", async () => {
    await expect(generateStaticParams()).resolves.toContainEqual({
      term: "gross-up",
    });
  });
});
