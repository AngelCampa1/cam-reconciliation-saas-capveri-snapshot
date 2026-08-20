import { describe, expect, it } from "vitest";

import { generateMetadata as generateBlogCategoryMetadata } from "@/app/blog/category/[category]/page";
import { metadata as docsMetadata } from "@/app/docs/page";
import { metadata as helpMetadata } from "@/app/help/page";
import { metadata as sourcesMetadata } from "@/app/sources/page";
import { generateMetadata as generateBlogMetadata } from "@/app/blog/[slug]/page";
import { generateMetadata as generateResourceMetadata } from "@/app/resources/[slug]/page";

describe("noindex metadata", () => {
  it("does not emit self-canonicals on noindex utility pages", async () => {
    const categoryMetadata = await generateBlogCategoryMetadata({
      params: Promise.resolve({ category: "cam-errors" }),
    });

    for (const metadata of [
      categoryMetadata,
      docsMetadata,
      helpMetadata,
      sourcesMetadata,
    ]) {
      expect(metadata.robots).toMatchObject({ index: false, follow: true });
      expect(metadata.alternates?.canonical).toBeUndefined();
    }
  });

  it("does not emit self-canonicals on demoted blog and resource pages", async () => {
    const blogMetadata = await generateBlogMetadata({
      params: Promise.resolve({ slug: "what-is-cam-reconciliation" }),
    });
    const resourceMetadata = await generateResourceMetadata({
      params: Promise.resolve({ slug: "what-is-cam-reconciliation" }),
    });

    for (const metadata of [blogMetadata, resourceMetadata]) {
      expect(metadata.robots).toMatchObject({ index: false, follow: true });
      expect(metadata.alternates?.canonical).toBeUndefined();
    }
  });
});
