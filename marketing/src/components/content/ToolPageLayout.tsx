import Link from "next/link";
import { ArrowRight, ChevronRight } from "lucide-react";
import { JsonLd } from "@/components/JsonLd";
import { buildTrialLink } from "@/lib/auditLink";

interface ToolPageLayoutProps {
  title?: string;
  description?: string;
  canonical?: string;
  toolName: string;
  /** Set to true on the /tools hub page to suppress the duplicate trailing crumb */
  isHub?: boolean;
  structuredData?: Record<string, unknown> | Record<string, unknown>[];
  children: React.ReactNode;
}

export function ToolPageLayout({
  toolName,
  isHub = false,
  structuredData,
  children,
}: ToolPageLayoutProps) {
  const schemas = structuredData
    ? Array.isArray(structuredData)
      ? structuredData
      : [structuredData]
    : [];
  return (
    <div className="tool-page-shell pb-24">
      {schemas.map((schema, i) => (
        <JsonLd key={i} data={schema} />
      ))}
      <div className="container mx-auto px-4 py-8 sm:px-6 lg:px-8 max-w-5xl">
        {/* Breadcrumb */}
        <nav
          aria-label="Breadcrumb"
          className="content-breadcrumb-text mb-6 flex flex-wrap items-center gap-1 text-sm"
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
          {isHub ? (
            <span className="content-breadcrumb-current">Tools</span>
          ) : (
            <>
              <Link
                href="/tools"
                className="content-breadcrumb-link inline-flex min-h-[44px] items-center"
              >
                Tools
              </Link>
              <ChevronRight
                className="content-breadcrumb-separator h-3.5 w-3.5"
                aria-hidden="true"
              />
              <span className="content-breadcrumb-current">{toolName}</span>
            </>
          )}
        </nav>

        {!isHub && (
          <Link
            href={buildTrialLink({ content: "tool_page_cta" })}
            className="mb-8 inline-flex min-h-11 items-center justify-center rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow transition-colors duration-200 hover:bg-primary/90"
          >
            Start free trial
            <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
          </Link>
        )}

        {children}

        {/* Fine-print verification disclaimer (applies to every tool) */}
        <p className="mt-12 border-t pt-6 text-xs text-muted-foreground">
          This free tool only gives a rough guess. The numbers may be wrong.
          Check your own lease and records first. This is not legal or tax
          advice.
        </p>
      </div>
    </div>
  );
}
