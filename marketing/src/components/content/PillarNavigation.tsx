import Link from "next/link";
import { BookOpen, ArrowRight } from "lucide-react";
import {
  getClusterRelatedLinks,
  getSeoClusterForPath,
} from "@/lib/seo/clusters";
import { slugToTitle } from "@/lib/slug-to-title";

export { slugToTitle };

interface PillarNavigationProps {
  currentPath: string;
}

/**
 * Finds which pillar cluster (if any) the current path belongs to,
 * then renders a compact navigation banner linking to the pillar
 * and sibling cluster pages.
 */
export function PillarNavigation({ currentPath }: PillarNavigationProps) {
  const cluster = getSeoClusterForPath(currentPath);
  const clusterLinks = getClusterRelatedLinks(currentPath, 8);

  const isPillarPage = currentPath === cluster.hub.href;

  return (
    <nav
      aria-label="Content cluster navigation"
      className="not-prose mb-8 rounded-lg border bg-muted/30 p-4"
    >
      <div className="flex items-center gap-2 mb-3">
        <BookOpen className="h-4 w-4 text-primary" aria-hidden="true" />
        <span className="text-sm font-semibold text-foreground">
          {isPillarPage ? "In This Guide" : "Part of"}
        </span>
        {!isPillarPage && (
          <Link
            href={cluster.hub.href}
            className="text-sm font-semibold text-primary hover:underline"
          >
            {cluster.label}
          </Link>
        )}
      </div>
      <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {clusterLinks.map(({ href, label }) => (
          <li key={href}>
            <Link
              href={href}
              className="flex min-h-[44px] items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors duration-200"
            >
              <ArrowRight className="h-3 w-3 shrink-0" aria-hidden="true" />
              <span className="line-clamp-2" title={label || slugToTitle(href)}>
                {label || slugToTitle(href)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
