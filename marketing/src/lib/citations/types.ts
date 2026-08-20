export interface CitationSource {
  id: string;
  title: string;
  publisher: string;
  publishedDate?: string;
  url: string;
  notes?: string;
  sourcesPageAnchor?: string;
}

export function createCitationNumberMap(
  sourceIdsInOrder: string[],
): Record<string, number> {
  const numberById: Record<string, number> = {};
  let currentNumber = 1;

  sourceIdsInOrder.forEach((id) => {
    if (!numberById[id]) {
      numberById[id] = currentNumber;
      currentNumber += 1;
    }
  });

  return numberById;
}
