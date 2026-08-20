/**
 * MDX Table Component - wraps markdown pipe tables in a responsive scroll container.
 *
 * AGENT GUIDELINES - Writing tables in MDX content files:
 *
 *   CORRECT - standard markdown pipe syntax:
 *   | Column A | Column B | Column C |
 *   |----------|----------|----------|
 *   | Row 1    | Value    | Value    |
 *
 *   INCORRECT - do NOT use raw HTML <table> tags in .mdx files.
 *   The MDX parser routes pipe tables here automatically via MDX_COMPONENTS.
 *
 *   DEPENDENCY: remark-gfm must be in mdxOptions.remarkPlugins in both:
 *     - marketing/src/app/resources/[slug]/page.tsx
 *     - marketing/src/app/blog/[slug]/page.tsx
 *   Without it, pipe tables render as raw | pipe | text |.
 */
export function Table(props: React.ComponentProps<"table">) {
  return (
    <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
      <table {...props} />
    </div>
  );
}
