import Link from "next/link";
import { ContentPageLayout } from "./ContentPageLayout";
import { PillarNavigation } from "./PillarNavigation";

interface BlogPostLayoutProps {
  pageName: string;
  structuredData?: Record<string, unknown> | Record<string, unknown>[];
  author: string;
  authorHref?: string;
  authorRole?: string;
  dateModified: string;
  readingTimeMinutes?: number;
  slug?: string;
  children: React.ReactNode;
}

export function BlogPostLayout({
  pageName,
  structuredData,
  author,
  authorHref,
  authorRole,
  dateModified,
  readingTimeMinutes,
  slug,
  children,
}: BlogPostLayoutProps) {
  const dateFormatted = new Date(dateModified + "T12:00:00").toLocaleDateString(
    "en-US",
    {
      year: "numeric",
      month: "long",
      day: "numeric",
    },
  );

  return (
    <ContentPageLayout
      pageName={pageName}
      structuredData={structuredData}
      backHref="/blog"
      backLabel="Blog"
    >
      <article className="prose prose-gray  max-w-none">
        <h1 className="text-3xl md:text-4xl font-bold mb-4 not-prose">
          {pageName}
        </h1>
        <div className="flex items-center gap-3 text-sm text-muted-foreground mb-8 not-prose">
          <span>
            By{" "}
            {authorHref ? (
              <Link
                href={authorHref}
                className="font-medium text-foreground hover:text-primary transition-colors duration-200"
              >
                {author}
              </Link>
            ) : (
              <strong className="font-medium text-foreground">{author}</strong>
            )}
            {authorRole && (
              <>
                <span className="mx-1.5 text-muted-foreground/50">·</span>
                <span>{authorRole}</span>
              </>
            )}
          </span>
          <span aria-hidden="true">·</span>
          <time dateTime={dateModified}>Updated {dateFormatted}</time>
          {readingTimeMinutes && (
            <>
              <span aria-hidden="true">·</span>
              <span>{readingTimeMinutes} min read</span>
            </>
          )}
        </div>
        {slug && <PillarNavigation currentPath={`/blog/${slug}`} />}
        {children}
      </article>
    </ContentPageLayout>
  );
}
