import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { JsonLd } from "@/components/JsonLd";

interface ContentPageLayoutProps {
  pageName: string;
  structuredData?: Record<string, unknown> | Record<string, unknown>[];
  children: React.ReactNode;
  backHref?: string;
  backLabel?: string;
}

export function ContentPageLayout({
  pageName,
  structuredData,
  children,
  backHref = "/resources",
  backLabel = "Resources",
}: ContentPageLayoutProps) {
  const schemas = structuredData
    ? Array.isArray(structuredData)
      ? structuredData
      : [structuredData]
    : [];
  return (
    <div className="content-page-shell pb-24">
      {schemas.map((schema, i) => (
        <JsonLd key={i} data={schema} />
      ))}
      {/* Breadcrumb */}
      <div className="content-breadcrumb-bar">
        <div className="mx-auto max-w-4xl px-4 py-3 sm:px-6 lg:px-8">
          <nav
            className="content-breadcrumb-text flex flex-wrap items-center gap-1 text-sm"
            aria-label="Breadcrumb"
          >
            <Link
              href="/"
              className="content-breadcrumb-link inline-flex min-h-[44px] items-center"
            >
              Home
            </Link>
            <ChevronRight
              className="content-breadcrumb-separator h-3.5 w-3.5"
              aria-hidden="true"
            />
            <Link
              href={backHref}
              className="content-breadcrumb-link inline-flex min-h-[44px] items-center"
            >
              {backLabel}
            </Link>
            <ChevronRight
              className="content-breadcrumb-separator h-3.5 w-3.5"
              aria-hidden="true"
            />
            <span className="content-breadcrumb-current">{pageName}</span>
          </nav>
        </div>
      </div>

      {/* Back link */}
      <div className="mx-auto max-w-4xl px-4 pt-6 sm:px-6 lg:px-8">
        <Link
          href={backHref}
          className="content-back-link inline-flex min-h-[44px] items-center"
        >
          <ChevronRight className="h-3.5 w-3.5 rotate-180" aria-hidden="true" />
          Back to {backLabel}
        </Link>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </div>
    </div>
  );
}
