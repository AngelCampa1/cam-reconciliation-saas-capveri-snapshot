import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import { BlogPostLayout } from "@/components/content/BlogPostLayout";
import {
  CrossSiteCallout,
  CrossSiteCalloutCamAudit,
  TenantAudienceBanner,
} from "@/components/content/CrossSiteCallout";
import { FrontmatterFAQ } from "@/components/content/FrontmatterFAQ";
import { RelatedContent } from "@/components/content/RelatedContent";
import { MDX_COMPONENTS } from "@/components/mdx";
import { getAllPosts, getPost } from "@/lib/content/mdx";
import { isDemotedBlogSlug } from "@/lib/seo/content-governance";
import { getClusterRelatedLinks } from "@/lib/seo/clusters";
import { buildContextualLinks } from "@/lib/seo/contextual-links";
import { structuredDataSchemas } from "@/lib/structured-data";
import { buildSiteUrl } from "@/lib/site";

export const dynamicParams = false;

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const posts = await getAllPosts("blog");
  return posts.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPost("blog", slug);
  if (!post) notFound();

  const url = buildSiteUrl(`/blog/${slug}`);
  const isDemoted = isDemotedBlogSlug(slug);
  return {
    title: post.frontmatter.title,
    description: post.frontmatter.description,
    alternates: isDemoted ? undefined : { canonical: url },
    robots: isDemoted
      ? {
          index: false,
          follow: true,
        }
      : undefined,
    openGraph: {
      title: post.frontmatter.title,
      description: post.frontmatter.description,
      url,
      type: "article",
      publishedTime: post.frontmatter.datePublished,
      modifiedTime: post.frontmatter.dateModified,
      images: [
        {
          url: buildSiteUrl(
            `/api/og?title=${encodeURIComponent(post.frontmatter.title)}&category=Blog`,
          ),
          width: 1200,
          height: 630,
          alt: post.frontmatter.title,
        },
      ],
    },
  };
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const post = await getPost("blog", slug);
  if (!post) notFound();

  const url = buildSiteUrl(`/blog/${slug}`);
  const wordCount = post.source.split(/\s+/).filter(Boolean).length;
  const readingTimeMinutes = Math.max(1, Math.ceil(wordCount / 250));

  const articleSchema = structuredDataSchemas.article({
    headline: post.frontmatter.title,
    description: post.frontmatter.description ?? "",
    url,
    datePublished: post.frontmatter.datePublished,
    dateModified: post.frontmatter.dateModified,
    author: {
      name: post.frontmatter.author,
      ...(post.frontmatter.author === "Angel Campa" && {
        jobTitle: "Founder, CapVeri",
        url: buildSiteUrl("/about/angel-campa"),
      }),
    },
    image: `/api/og?title=${encodeURIComponent(post.frontmatter.title)}&category=Blog`,
    wordCount,
    articleSection: "Blog",
  });

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
        name: post.frontmatter.title,
        item: url,
      },
    ],
  };

  const schemas: Record<string, unknown>[] = [articleSchema, breadcrumbSchema];

  if (post.frontmatter.faq && post.frontmatter.faq.length > 0) {
    schemas.push({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: post.frontmatter.faq.map(
        (item: { q: string; a: string }) => ({
          "@type": "Question",
          name: item.q,
          acceptedAnswer: { "@type": "Answer", text: item.a },
        }),
      ),
    });
  }

  const blogPath = `/blog/${slug}`;
  const relatedLinks = [
    ...getClusterRelatedLinks(blogPath),
    ...buildContextualLinks({
      currentPath: blogPath,
      funnelStage: post.frontmatter.funnelStage,
      audience: post.frontmatter.audience,
      tags: post.frontmatter.tags,
    }),
  ].filter(
    (link, index, links) =>
      links.findIndex((candidate) => candidate.href === link.href) === index,
  );

  return (
    <BlogPostLayout
      slug={slug}
      pageName={post.frontmatter.title}
      structuredData={schemas}
      author={post.frontmatter.author}
      authorHref={
        post.frontmatter.author === "Angel Campa"
          ? "/about/angel-campa"
          : undefined
      }
      authorRole={post.frontmatter.authorRole ?? "Founder, CapVeri"}
      dateModified={post.frontmatter.dateModified}
      readingTimeMinutes={readingTimeMinutes}
    >
      {/* mixed intentionally omits the banner - landlord visitors on mixed-audience pages shouldn't see a redirect prompt */}
      {post.frontmatter.audience === "tenant" && <TenantAudienceBanner />}
      <MDXRemote
        source={post.source}
        components={MDX_COMPONENTS}
        options={{
          parseFrontmatter: false,
          blockJS: false,
          mdxOptions: { remarkPlugins: [remarkGfm] },
        }}
      />
      <FrontmatterFAQ faqs={post.frontmatter.faq} />
      {post.frontmatter.audience === "tenant" ||
      post.frontmatter.audience === "mixed" ? (
        <CrossSiteCalloutCamAudit />
      ) : (
        <CrossSiteCallout />
      )}
      <RelatedContent links={relatedLinks} />
    </BlogPostLayout>
  );
}
