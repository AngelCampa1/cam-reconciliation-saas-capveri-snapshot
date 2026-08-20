import Link from "next/link";
import { ArrowRight } from "lucide-react";

interface RelatedLink {
  href: string;
  label: string;
}

interface RelatedContentProps {
  title?: string;
  links: RelatedLink[];
}

export function RelatedContent({
  title = "Related Resources",
  links,
}: RelatedContentProps) {
  if (links.length === 0) return null;
  return (
    <div className="not-prose rounded-lg border bg-muted/20 p-6 mb-8">
      <h2 className="font-bold mb-4">{title}</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {links.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className="flex min-h-[44px] items-center gap-2 rounded-full border bg-background p-3 text-base sm:text-sm font-medium hover:bg-muted/50 transition-colors duration-200"
          >
            {label}
            <ArrowRight
              className="h-3.5 w-3.5 ml-auto text-muted-foreground"
              aria-hidden="true"
            />
          </Link>
        ))}
      </div>
    </div>
  );
}
