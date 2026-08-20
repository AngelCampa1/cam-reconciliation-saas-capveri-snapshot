interface CitationChipProps {
  sourceId: string;
  numberById: Record<string, number>;
}

export function CitationChip({ sourceId, numberById }: CitationChipProps) {
  const citationNumber = numberById[sourceId];

  if (!citationNumber) {
    throw new Error(`Missing citation number for source id: ${sourceId}`);
  }

  return (
    <a
      href={`#source-${citationNumber}`}
      aria-label={`Source ${citationNumber}`}
      className="align-super text-xs font-semibold text-primary hover:underline ml-1"
    >
      [{citationNumber}]
    </a>
  );
}
