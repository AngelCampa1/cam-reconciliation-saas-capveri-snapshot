# Story 16.3: Create Bounding Box Overlay

## Story Info
- **Epic**: Human-in-the-Loop Verification UI
- **Estimated Hours**: 4
- **Dependencies**: Story 16.1, Story 16.2
- **Status**: `completed`
- **Completed**: 2025-12-29

## User Story
Overlay bounding boxes on the PDF to highlight where each extracted value was found.

## Acceptance Criteria
- [x] Bounding boxes render on PDF at correct positions
- [x] Different colors for different confidence levels
- [x] Click on box highlights corresponding form field
- [x] Hover shows tooltip with extracted value
- [x] Boxes scale correctly with PDF zoom
- [x] Multiple boxes per page supported

## Technical Specifications

```tsx
// src/components/hitl/BoundingBoxOverlay.tsx
import { useMemo } from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface BoundingBox {
  left: number;    // 0-1 relative to page width
  top: number;     // 0-1 relative to page height
  width: number;   // 0-1 relative to page width
  height: number;  // 0-1 relative to page height
}

interface SourceHighlight {
  field: string;
  text: string;
  boundingBox: BoundingBox;
  confidence: 'high' | 'medium' | 'low';
  page: number;
}

interface BoundingBoxOverlayProps {
  sources: SourceHighlight[];
  currentPage: number;
  pageWidth: number;
  pageHeight: number;
  onBoxClick?: (field: string) => void;
  activeField?: string;
}

const confidenceColors = {
  high: 'border-green-500 bg-green-500/10',
  medium: 'border-amber-500 bg-amber-500/10',
  low: 'border-red-500 bg-red-500/10',
};

export function BoundingBoxOverlay({
  sources,
  currentPage,
  pageWidth,
  pageHeight,
  onBoxClick,
  activeField,
}: BoundingBoxOverlayProps) {
  // Filter sources for current page
  const pageBoxes = useMemo(
    () => sources.filter((s) => s.page === currentPage),
    [sources, currentPage]
  );

  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{ width: pageWidth, height: pageHeight }}
    >
      {pageBoxes.map((source) => {
        const { boundingBox: bbox, field, text, confidence } = source;
        const isActive = field === activeField;

        return (
          <Tooltip key={field}>
            <TooltipTrigger asChild>
              <button
                onClick={() => onBoxClick?.(field)}
                className={cn(
                  'absolute border-2 rounded-sm pointer-events-auto',
                  'transition-all duration-200',
                  confidenceColors[confidence],
                  isActive && 'ring-2 ring-primary border-primary',
                  'hover:opacity-80'
                )}
                style={{
                  left: `${bbox.left * 100}%`,
                  top: `${bbox.top * 100}%`,
                  width: `${bbox.width * 100}%`,
                  height: `${bbox.height * 100}%`,
                }}
                aria-label={`Source for ${field}: ${text}`}
              />
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs">
              <div className="space-y-1">
                <p className="font-medium">{formatFieldName(field)}</p>
                <p className="text-sm text-muted-foreground">"{text}"</p>
                <p className="text-xs">
                  Confidence: <span className={cn(
                    confidence === 'high' && 'text-green-600',
                    confidence === 'medium' && 'text-amber-600',
                    confidence === 'low' && 'text-red-600',
                  )}>{confidence}</span>
                </p>
              </div>
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

function formatFieldName(field: string): string {
  return field
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}
```

## Test Cases
```typescript
describe('BoundingBoxOverlay', () => {
  const mockSources: SourceHighlight[] = [
    {
      field: 'proRataShare',
      text: '5.23%',
      boundingBox: { left: 0.1, top: 0.2, width: 0.1, height: 0.02 },
      confidence: 'high',
      page: 1,
    },
  ];

  it('renders boxes for current page only', () => {
    render(
      <BoundingBoxOverlay
        sources={mockSources}
        currentPage={1}
        pageWidth={800}
        pageHeight={1000}
      />
    );

    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('does not render boxes for other pages', () => {
    render(
      <BoundingBoxOverlay
        sources={mockSources}
        currentPage={2}
        pageWidth={800}
        pageHeight={1000}
      />
    );

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('calls onBoxClick when clicked', async () => {
    const onBoxClick = vi.fn();
    render(
      <BoundingBoxOverlay
        sources={mockSources}
        currentPage={1}
        pageWidth={800}
        pageHeight={1000}
        onBoxClick={onBoxClick}
      />
    );

    await userEvent.click(screen.getByRole('button'));
    expect(onBoxClick).toHaveBeenCalledWith('proRataShare');
  });

  it('highlights active field', () => {
    render(
      <BoundingBoxOverlay
        sources={mockSources}
        currentPage={1}
        pageWidth={800}
        pageHeight={1000}
        activeField="proRataShare"
      />
    );

    expect(screen.getByRole('button')).toHaveClass('ring-2');
  });

  it('shows tooltip on hover', async () => {
    render(
      <BoundingBoxOverlay
        sources={mockSources}
        currentPage={1}
        pageWidth={800}
        pageHeight={1000}
      />
    );

    await userEvent.hover(screen.getByRole('button'));

    await waitFor(() => {
      expect(screen.getByText('"5.23%"')).toBeInTheDocument();
    });
  });
});
```

## Definition of Done
- [x] Bounding boxes render at correct positions
- [x] Colors reflect confidence levels
- [x] Click navigates to form field
- [x] Tooltips show extracted text
- [x] Boxes scale with zoom
- [x] Unit tests passing with 95%+ coverage

## Implementation Notes
- Created `BoundingBoxOverlay` component at `frontend/src/components/hitl/BoundingBoxOverlay.tsx` (122 lines)
- Implemented 23 comprehensive tests covering:
  - Page filtering (4 tests)
  - Click interaction (3 tests)
  - Active field highlighting (3 tests)
  - Confidence colors (3 tests)
  - Tooltip display (3 tests)
  - Positioning and scaling (2 tests)
  - Multiple boxes (2 tests)
  - Accessibility (2 tests)
  - Custom className (1 test)
- Features implemented:
  - Percentage-based positioning (0-1 normalized coordinates)
  - Confidence-based color coding (green=high, amber=medium, red=low)
  - Radix UI Tooltip integration with formatted field names
  - Click handlers with optional callback
  - Active field highlighting with ring effect
  - Page filtering using useMemo
  - Keyboard accessibility with aria-label
  - Support for multiple boxes per field (using index-based keys)
- All 23 tests pass with full coverage
- Fixed Radix UI Tooltip duplicate rendering issue by using `getAllByText` in tests
