import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { MDXRemote } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import { ContentPageLayout } from "@/components/content/ContentPageLayout";
import {
  CrossSiteCallout,
  CrossSiteCalloutCamAudit,
} from "@/components/content/CrossSiteCallout";
import { FrontmatterFAQ } from "@/components/content/FrontmatterFAQ";
import { RelatedContent } from "@/components/content/RelatedContent";
import { PillarNavigation } from "@/components/content/PillarNavigation";
import { MDX_COMPONENTS } from "@/components/mdx";
import { getAllPosts, getPost } from "@/lib/content/mdx";
import { isDemotedResourceSlug } from "@/lib/seo/content-governance";
import { getClusterRelatedLinks } from "@/lib/seo/clusters";
import { buildContextualLinks } from "@/lib/seo/contextual-links";
import type { ResourceFrontmatter } from "@/lib/content/types";
import { structuredDataSchemas } from "@/lib/structured-data";
import { buildSiteUrl } from "@/lib/site";

export const dynamicParams = false;

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const posts = await getAllPosts("resources");
  return posts.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPost("resources", slug);
  if (!post) notFound();

  const url = buildSiteUrl(`/resources/${slug}`);
  const isDemoted = isDemotedResourceSlug(slug);
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
            `/api/og?title=${encodeURIComponent(post.frontmatter.title)}&category=Resource`,
          ),
          width: 1200,
          height: 630,
          alt: post.frontmatter.title,
        },
      ],
    },
  };
}

export default async function ResourcePage({ params }: Props) {
  const { slug } = await params;
  const post = await getPost("resources", slug);
  if (!post) notFound();

  const fm = post.frontmatter as ResourceFrontmatter;
  const url = buildSiteUrl(`/resources/${slug}`);

  const articleSchema = structuredDataSchemas.article({
    headline: fm.title,
    description: fm.description ?? "",
    url,
    datePublished: fm.datePublished,
    dateModified: fm.dateModified,
    author: {
      name: fm.author,
      ...(fm.author === "Angel Campa" && {
        jobTitle: "Founder, CapVeri",
        url: buildSiteUrl("/about/angel-campa"),
      }),
    },
    image: `/api/og?title=${encodeURIComponent(fm.title)}&category=Resource`,
    articleSection: "Resources",
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
        name: "Resources",
        item: buildSiteUrl("/resources"),
      },
      { "@type": "ListItem", position: 3, name: fm.title, item: url },
    ],
  };

  const schemas: Record<string, unknown>[] = [articleSchema, breadcrumbSchema];

  if (fm.faq && fm.faq.length > 0) {
    schemas.push({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: fm.faq.map((item) => ({
        "@type": "Question",
        name: item.q,
        acceptedAnswer: { "@type": "Answer", text: item.a },
      })),
    });
  }

  const resourcePath = `/resources/${slug}`;
  const relatedLinks = [
    ...getClusterRelatedLinks(resourcePath),
    ...buildContextualLinks({
      currentPath: resourcePath,
      funnelStage: fm.funnelStage,
      audience: fm.audience,
      tags: fm.tags,
    }),
  ].filter(
    (link, index, links) =>
      links.findIndex((candidate) => candidate.href === link.href) === index,
  );

  return (
    <ContentPageLayout pageName={fm.title} structuredData={schemas}>
      <article className="prose prose-gray  max-w-none">
        <h1 className="text-3xl md:text-4xl font-bold mb-4 not-prose">
          {fm.title}
        </h1>
        <div className="flex items-center gap-3 text-sm text-muted-foreground mb-8 not-prose">
          <span>
            By{" "}
            {fm.author === "Angel Campa" ? (
              <>
                <Link
                  href="/about/angel-campa"
                  className="font-medium text-foreground hover:text-primary transition-colors duration-200"
                >
                  {fm.author}
                </Link>
                <span className="mx-1.5 text-muted-foreground/50">·</span>
                <span>Founder, CapVeri</span>
              </>
            ) : (
              <strong className="font-medium text-foreground">
                {fm.author}
              </strong>
            )}
          </span>
          <span aria-hidden="true">·</span>
          <time dateTime={fm.dateModified}>
            Updated{""}
            {new Date(fm.dateModified).toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </time>
        </div>
        <PillarNavigation currentPath={resourcePath} />
        <MDXRemote
          source={post.source}
          components={MDX_COMPONENTS}
          options={{
            parseFrontmatter: false,
            blockJS: false,
            mdxOptions: { remarkPlugins: [remarkGfm] },
          }}
        />
        <FrontmatterFAQ faqs={fm.faq} />
      </article>
      {fm.audience === "tenant" || fm.audience === "mixed" ? (
        <CrossSiteCalloutCamAudit />
      ) : (
        <CrossSiteCallout />
      )}
      <RelatedContent links={relatedLinks} />
    </ContentPageLayout>
  );
}
