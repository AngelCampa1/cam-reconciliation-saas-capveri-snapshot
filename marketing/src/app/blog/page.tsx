import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { JsonLd } from "@/components/JsonLd";
import { getAllPosts } from "@/lib/content/mdx";
import { isDemotedBlogSlug } from "@/lib/seo/content-governance";
import { structuredDataSchemas } from "@/lib/structured-data";
import { buildTrialLink } from "@/lib/auditLink";
import { buildSiteUrl } from "@/lib/site";

const BLOG_TITLE = "CRE FinOps Blog: Insights for Commercial Landlords";
const BLOG_DESC =
  "Guides for CAM close, gross-up checks, cap tracking, SB 1103, and audit defense.";

export const metadata: Metadata = {
  title: BLOG_TITLE,
  description: BLOG_DESC,
  alternates: { canonical: buildSiteUrl("/blog") },
  openGraph: {
    title: BLOG_TITLE,
    description: BLOG_DESC,
    url: buildSiteUrl("/blog"),
    type: "website",
    images: [
      {
        url: buildSiteUrl(
          `/api/og?title=${encodeURIComponent("CRE FinOps Blog")}&category=Blog`,
        ),
        width: 1200,
        height: 630,
        alt: BLOG_TITLE,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: BLOG_TITLE,
    description: BLOG_DESC,
  },
};

const blogFaqSchema = structuredDataSchemas.faqPage([
  {
    question: "What topics does the CapVeri blog cover?",
    answer:
      "The CapVeri blog covers CAM close, gross-up checks, cap tracking, SB 1103, audit defense, common billing errors, BOMA 2024 standards, lease clauses, and practical guides for property controllers and asset managers.",
  },
  {
    question: "What is CRE FinOps?",
    answer:
      "CRE FinOps (Commercial Real Estate Financial Operations) applies financial engineering discipline to property-level operations. It covers CAM reconciliation accuracy, expense recovery, billing compliance, and data-driven lease administration. It helps landlords recover what they are owed while staying audit-ready.",
  },
  {
    question: "How often should a landlord perform a CAM reconciliation?",
    answer:
      "Most commercial leases require an annual CAM reconciliation, typically completed 90–120 days after the fiscal year end (so by March 31 or April 30 for calendar-year leases). Some leases allow tenants to request an audit within 1–3 years of receiving the reconciliation statement.",
  },
]);

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
  ],
};

export default async function BlogPage() {
  // Demoted slugs are noindex (and some are 308-redirected to a canonical page),
  // so they must not appear as cards or in the itemList schema on the index.
  const posts = (await getAllPosts("blog")).filter(
    (post) => !isDemotedBlogSlug(post.slug),
  );
  const collectionSchema = structuredDataSchemas.webPage({
    name: BLOG_TITLE,
    url: buildSiteUrl("/blog"),
    description: BLOG_DESC,
    pageType: "CollectionPage",
    dateModified: posts[0]?.frontmatter.dateModified,
  });
  const itemListSchema = structuredDataSchemas.itemList({
    name: "CapVeri Blog Posts",
    description: BLOG_DESC,
    items: posts.map((post) => ({
      name: post.frontmatter.title,
      url: `/blog/${post.slug}`,
    })),
  });

  return (
    <div className="min-h-screen bg-background pb-24">
      <JsonLd data={breadcrumbSchema} />
      <JsonLd data={blogFaqSchema} />
      <JsonLd data={collectionSchema} />
      <JsonLd data={itemListSchema} />

      {/* Hero */}
      <section className="bg-background pt-16 pb-8 md:py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            CRE FinOps Blog
          </h1>
          <p className="lead-text mt-4 text-xl text-muted-foreground max-w-2xl mx-auto">
            Guides for CAM close, gross-up checks, cap tracking, SB 1103, and
            audit defense.
          </p>
          <Link
            href={buildTrialLink({ content: "blog_index_cta" })}
            className="mt-6 inline-flex min-h-11 items-center justify-center rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow transition-colors duration-200 hover:bg-primary/90"
          >
            Start free trial
          </Link>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {[
              { href: "/blog/category/cam-errors", label: "CAM Errors" },
              { href: "/blog/category/compliance", label: "Compliance" },
              { href: "/blog/category/cre-finops", label: "CRE FinOps" },
              { href: "/blog/category/how-to", label: "How-To Guides" },
              { href: "/blog/category/operations", label: "Operations" },
              { href: "/blog/category/market-trends", label: "Market Trends" },
              { href: "/blog/category/technology", label: "Technology" },
            ].map((cat) => (
              <Link
                key={cat.href}
                href={cat.href}
                className="inline-flex min-h-11 items-center rounded-full border border-border px-4 py-1.5 text-sm font-medium text-muted-foreground transition-colors duration-200 hover:border-primary/50 hover:text-primary"
              >
                {cat.label}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Post cards */}
      <section className="pt-6 pb-12 md:py-12 bg-muted/30">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          {posts.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">
              No posts yet. Check back soon.
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
                      Post
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
