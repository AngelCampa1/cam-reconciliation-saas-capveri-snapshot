import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { ArrowLeft, ArrowRight, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { JsonLd } from "@/components/JsonLd";
import { getAllPosts } from "@/lib/content/mdx";
import { structuredDataSchemas } from "@/lib/structured-data";
import type { BlogCategory } from "@/lib/content/types";
import { buildSiteUrl } from "@/lib/site";

const CATEGORIES: Record<
  BlogCategory,
  { label: string; title: string; description: string }
> = {
  "cam-errors": {
    label: "CAM Errors",
    title: "CAM Reconciliation Errors: Common Mistakes and How to Fix Them",
    description:
      "Articles on the most common CAM reconciliation errors that cost commercial landlords revenue. Covers gross-up mistakes, cap miscalculations, and billing omissions.",
  },
  compliance: {
    label: "Compliance",
    title: "CRE Compliance: SB 1103, BOMA 2024 and Regulatory Guides",
    description:
      "Guides on commercial real estate compliance requirements including California SB 1103, BOMA 2024 measurement standards, and CAM billing regulations.",
  },
  "cre-finops": {
    label: "CRE FinOps",
    title: "CRE FinOps: Commercial Real Estate Financial Operations",
    description:
      "Articles on CRE FinOps, the emerging discipline of commercial real estate financial operations. Covers CAM optimization, expense recovery, and data-driven property management.",
  },
  "how-to": {
    label: "How-To Guides",
    title: "CAM Reconciliation How-To Guides for Commercial Landlords",
    description:
      "Step-by-step guides for commercial landlords and property controllers. Covers demand letters, audit trails, reconciliation workflows, and deadline management.",
  },
  operations: {
    label: "Operations",
    title: "Property Operations: CAM Billing Workflows and Best Practices",
    description:
      "Operational guides for property controllers and managers. Covers CAM billing workflows, team delegation, tenant communication, and collections.",
  },
  "market-trends": {
    label: "Market Trends",
    title: "CRE Market Trends: Vacancy, Tax and CAM Implications",
    description:
      "Analysis of commercial real estate market trends and their impact on CAM reconciliation. Covers vacancy rates, property tax changes, and regional insights.",
  },
  technology: {
    label: "Technology",
    title: "CAM Technology: Automation, Software and Data Migration",
    description:
      "Guides on CAM reconciliation technology. Covers automation tools, software evaluation, data migration, and the role of AI in commercial real estate.",
  },
};

const CATEGORY_ALIASES: Record<string, BlogCategory> = {
  "cam-reconciliation": "cam-errors",
};

function resolveCategory(category: string): BlogCategory | string {
  return CATEGORY_ALIASES[category] ?? category;
}

export const dynamicParams = false;

interface Props {
  params: Promise<{ category: string }>;
}

export function generateStaticParams() {
  return [
    ...Object.keys(CATEGORIES).map((category) => ({ category })),
    ...Object.keys(CATEGORY_ALIASES).map((category) => ({ category })),
  ];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { category } = await params;
  const resolvedCategory = resolveCategory(category);
  const cat = CATEGORIES[resolvedCategory as BlogCategory];
  if (!cat) notFound();

  return {
    title: cat.title,
    description: cat.description,
    robots: {
      index: false,
      follow: true,
    },
  };
}

export default async function BlogCategoryPage({ params }: Props) {
  const { category } = await params;
  const resolvedCategory = resolveCategory(category);
  if (resolvedCategory !== category) {
    permanentRedirect(`/blog/category/${resolvedCategory}`);
  }

  const cat = CATEGORIES[resolvedCategory as BlogCategory];
  if (!cat) notFound();

  const allPosts = await getAllPosts("blog");
  const posts = allPosts.filter(
    (p) => p.frontmatter.category === resolvedCategory,
  );
  const categoryUrl = buildSiteUrl(`/blog/category/${resolvedCategory}`);

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: buildSiteUrl("/"),
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Blog",
        item: buildSiteUrl("/blog"),
      },
      {
        "@type": "ListItem",
        position: 3,
        name: cat.label,
        item: categoryUrl,
      },
    ],
  };
  const collectionSchema = structuredDataSchemas.webPage({
    name: cat.title,
    url: categoryUrl,
    description: cat.description,
    pageType: "CollectionPage",
    dateModified: posts[0]?.frontmatter.dateModified,
  });
  const itemListSchema = structuredDataSchemas.itemList({
    name: `${cat.label} Blog Posts`,
    description: cat.description,
    items: posts.map((post) => ({
      name: post.frontmatter.title,
      url: `/blog/${post.slug}`,
    })),
  });

  return (
    <div className="min-h-screen bg-background pb-24">
      <JsonLd data={breadcrumbSchema} />
      <JsonLd data={collectionSchema} />
      <JsonLd data={itemListSchema} />

      <section className="bg-background py-16 md:py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <Link
            href="/blog"
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors duration-200 mb-8"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            All Posts
          </Link>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
            {cat.label}
          </h1>
          <p className="lead-text mt-4 text-xl text-muted-foreground max-w-2xl mx-auto">
            {cat.description}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {(
              [
                {
                  href: "/blog/category/cam-errors",
                  label: "CAM Errors",
                  key: "cam-errors",
                },
                {
                  href: "/blog/category/compliance",
                  label: "Compliance",
                  key: "compliance",
                },
                {
                  href: "/blog/category/cre-finops",
                  label: "CRE FinOps",
                  key: "cre-finops",
                },
                {
                  href: "/blog/category/how-to",
                  label: "How-To Guides",
                  key: "how-to",
                },
                {
                  href: "/blog/category/operations",
                  label: "Operations",
                  key: "operations",
                },
                {
                  href: "/blog/category/market-trends",
                  label: "Market Trends",
                  key: "market-trends",
                },
                {
                  href: "/blog/category/technology",
                  label: "Technology",
                  key: "technology",
                },
              ] as { href: string; label: string; key: string }[]
            ).map((c) =>
              c.key === resolvedCategory ? (
                <span
                  key={c.href}
                  aria-current="page"
                  className="inline-flex items-center rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground"
                >
                  {c.label}
                </span>
              ) : (
                <Link
                  key={c.href}
                  href={c.href}
                  className="inline-flex items-center rounded-full border border-border px-4 py-1.5 text-sm font-medium text-muted-foreground hover:text-primary hover:border-primary/50 transition-colors duration-200"
                >
                  {c.label}
                </Link>
              ),
            )}
          </div>
        </div>
      </section>

      <section className="py-12 bg-muted/30">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          {posts.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">
              No posts in this category yet.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 max-w-4xl mx-auto">
              {posts.map((post) => (
                <div
                  key={post.slug}
                  className="rounded-xl border border-border bg-card p-6 shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                      <BookOpen className="h-3 w-3" />
                      {cat.label}
                    </span>
                    <time
                      className="text-xs text-muted-foreground"
                      dateTime={post.frontmatter.datePublished}
                    >
                      {new Date(
                        post.frontmatter.datePublished,
                      ).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </time>
                  </div>
                  <h2 className="text-xl font-semibold mb-2">
                    {post.frontmatter.title}
                  </h2>
                  <p className="text-muted-foreground text-sm mb-6">
                    {post.frontmatter.excerpt}
                  </p>
                  <Button asChild variant="outline" className="w-full">
                    <Link
                      href={`/blog/${post.slug}`}
                      aria-label={post.frontmatter.title}
                    >
                      Read Post
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
