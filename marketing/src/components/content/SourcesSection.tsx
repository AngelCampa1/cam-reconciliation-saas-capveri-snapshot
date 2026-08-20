import type { CitationSource } from "@/lib/citations/types";

interface SourcesSectionProps {
  sources: CitationSource[];
  numberById: Record<string, number>;
  heading?: string;
}

export function SourcesSection({
  sources,
  numberById,
  heading = "Sources",
}: SourcesSectionProps) {
  const orderedSources = [...sources].sort(
    (a, b) =>
      (numberById[a.id] ?? Number.MAX_SAFE_INTEGER) -
      (numberById[b.id] ?? Number.MAX_SAFE_INTEGER),
  );

  return (
    <section className="mt-10 border-t pt-6 not-prose">
      <h2 className="text-xl font-semibold mb-4">{heading}</h2>
      <ol className="space-y-3 text-sm text-muted-foreground">
        {orderedSources.map((source) => {
          const number = numberById[source.id];
          if (!number) {
            return null;
          }

          return (
            <li
              key={source.id}
              id={`source-${number}`}
              className="leading-relaxed"
            >
              <span className="font-medium text-foreground mr-2">
                [{number}]
              </span>
              <span className="text-foreground">{source.title}</span>.{" "}
              {source.publisher}
              {source.publishedDate ? ` (${source.publishedDate})` : ""}.{" "}
              <a
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                {source.url}
              </a>
              {source.sourcesPageAnchor ? (
                <>
                  {" "}
                  <a
                    href={`/sources#${source.sourcesPageAnchor}`}
                    className="text-primary hover:underline"
                  >
                    Methodology
                  </a>
                </>
              ) : null}
              {source.notes ? ` ${source.notes}` : ""}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
