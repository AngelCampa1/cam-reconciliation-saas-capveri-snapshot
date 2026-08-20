import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import FeaturesPage from "../product/features/page";
import FeatureDetailPage, {
  generateMetadata,
  generateStaticParams,
} from "../product/features/[slug]/page";
import { productFeatures } from "@/lib/product-features";

describe("feature landing pages", () => {
  it("renders the feature hub with one clickable link per canonical feature", () => {
    render(<FeaturesPage />);

    for (const feature of productFeatures) {
      expect(
        screen.getByRole("link", { name: new RegExp(feature.name, "i") }),
      ).toHaveAttribute("href", `/product/features/${feature.key}`);
    }
  });

  it("generates one static route per canonical feature", () => {
    expect(generateStaticParams()).toEqual(
      productFeatures.map((feature) => ({ slug: feature.key })),
    );
  });

  it.each(productFeatures)(
    "renders $key with problem then solution",
    async (feature) => {
      const { unmount } = render(
        await FeatureDetailPage({
          params: Promise.resolve({ slug: feature.key }),
        }),
      );

      const headings = screen.getAllByRole("heading", { level: 2 });
      expect(headings[0]).toHaveTextContent("Problem");
      expect(headings[1]).toHaveTextContent("Solution");
      expect(
        screen.getByRole("link", { name: /Back to all features/i }),
      ).toHaveAttribute("href", "/product/features");
      unmount();
    },
  );

  it("generates canonical SEO metadata for every feature detail page", async () => {
    for (const feature of productFeatures) {
      const metadata = await generateMetadata({
        params: Promise.resolve({ slug: feature.key }),
      });

      expect(metadata.title).toContain(feature.name);
      expect(metadata.alternates?.canonical).toBe(
        `https://www.capveri.com/product/features/${feature.key}`,
      );
    }
  });

  it("keeps public feature copy clear of unsafe AI and retention claims", () => {
    const disallowedClaims = [
      /Claude reviews your GL/i,
      /Nothing is stored/i,
      /unverified data-retention/i,
      /zero data retention/i,
      /ZDR/i,
    ];

    for (const feature of productFeatures) {
      const publicCopy = `${feature.name} ${feature.description}`;
      for (const claim of disallowedClaims) {
        expect(publicCopy).not.toMatch(claim);
      }
    }
  });
});
