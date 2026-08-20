import governance from "../../../data/seo/content-governance.json";

export const RETAINED_SOFTWARE_GUIDE_SLUGS =
  governance.retainedSoftwareGuideSlugs;

export const RETAINED_COMPARISON_SLUGS = governance.retainedComparisonSlugs;

export const RETAINED_GLOSSARY_TERM_SLUGS =
  governance.retainedGlossaryTermSlugs;

export const DEMOTED_BLOG_SLUGS = governance.demotedBlogSlugs ?? [];
export const DEMOTED_RESOURCE_SLUGS = governance.demotedResourceSlugs ?? [];

type Slugged = { slug: string };

export function filterByRetainedSlugs<T extends Slugged>(
  items: T[],
  retainedSlugs: readonly string[],
): T[] {
  const keep = new Set(retainedSlugs);
  return items.filter((item) => keep.has(item.slug));
}

export function isDemotedBlogSlug(slug: string): boolean {
  return DEMOTED_BLOG_SLUGS.includes(slug);
}

export function isDemotedResourceSlug(slug: string): boolean {
  return DEMOTED_RESOURCE_SLUGS.includes(slug);
}
