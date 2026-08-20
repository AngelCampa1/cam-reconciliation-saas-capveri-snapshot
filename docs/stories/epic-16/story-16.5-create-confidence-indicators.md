# Story 16.5: Create Confidence Indicators

## Story Info
- **Epic**: Human-in-the-Loop Verification UI
- **Estimated Hours**: 2
- **Dependencies**: Story 16.4
- **Status**: `completed`
- **Completed**: 2025-12-29

## User Story
Visual indicators for low-confidence fields that require special attention during verification.

## Acceptance Criteria
- [x] Color-coded confidence badges (high/medium/low)
- [x] Low-confidence fields visually highlighted
- [x] Summary of fields needing review at top
- [x] Filter to show only low-confidence fields
- [x] Confidence explanation tooltips
- [x] Progress indicator for verification

## Technical Specifications

Color-coded confidence indicators with visual highlighting and filtering capabilities.

**Reference**: See `docs/architecture/hitl-state-management.md` for full state management patterns.

```typescript
// frontend/src/features/verification/components/ConfidenceIndicator.tsx
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

type ConfidenceLevel = 'high' | 'medium' | 'low';

interface ConfidenceIndicatorProps {
  confidence: number;  // 0-1 normalized
  sourceText?: string;
}

function getConfidenceLevel(confidence: number): ConfidenceLevel {
  if (confidence >= 0.9) return 'high';
  if (confidence >= 0.7) return 'medium';
  return 'low';
}

const CONFIDENCE_STYLES: Record<ConfidenceLevel, string> = {
  high: 'bg-green-100 text-green-800 border-green-200',
  medium: 'bg-amber-100 text-amber-800 border-amber-200',
  low: 'bg-red-100 text-red-800 border-red-200',
};

export function ConfidenceIndicator({ confidence, sourceText }: ConfidenceIndicatorProps) {
  const level = getConfidenceLevel(confidence);
  const percentage = Math.round(confidence * 100);

  return (
    <Tooltip>
      <TooltipTrigger>
        <Badge variant="outline" className={CONFIDENCE_STYLES[level]}>
          {percentage}%
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <p className="font-medium">Confidence: {level}</p>
        {sourceText && (
          <p className="text-sm text-muted-foreground mt-1">
            Source: "{sourceText.slice(0, 100)}..."
          </p>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

// frontend/src/features/verification/components/VerificationSummary.tsx
interface VerificationSummaryProps {
  sourceReferences: FieldSourceReference[];
  onFilterChange: (filter: 'all' | 'low') => void;
  currentFilter: 'all' | 'low';
}

export function VerificationSummary({
  sourceReferences,
  onFilterChange,
  currentFilter,
}: VerificationSummaryProps) {
  const lowConfidenceCount = sourceReferences.filter(r => r.confidence < 0.7).length;
  const totalFields = sourceReferences.length;
  const verifiedCount = sourceReferences.filter(r => r.verified).length;

  return (
    <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
      <div className="flex-1">
        <div className="text-sm text-muted-foreground">Verification Progress</div>
        <div className="flex items-center gap-2 mt-1">
          <Progress value={(verifiedCount / totalFields) * 100} className="flex-1" />
          <span className="text-sm font-medium">{verifiedCount}/{totalFields}</span>
        </div>
      </div>

      {lowConfidenceCount > 0 && (
        <Button
          variant={currentFilter === 'low' ? 'default' : 'outline'}
          size="sm"
          onClick={() => onFilterChange(currentFilter === 'low' ? 'all' : 'low')}
          className="gap-2"
        >
          <AlertTriangle className="h-4 w-4" />
          {lowConfidenceCount} need review
        </Button>
      )}
    </div>
  );
}
```

## Test Cases

Test confidence indicator functionality including:
- High confidence (≥90%) displays green badge
- Medium confidence (70-89%) displays amber badge
- Low confidence (<70%) displays red badge
- Tooltip shows source text preview
- Filter toggles correctly between all/low-confidence fields
- Progress indicator updates as fields are verified

## Definition of Done
- [x] Confidence badges display correctly
- [x] Low-confidence fields highlighted
- [x] Summary shows field counts
- [x] Navigation to fields works
- [x] Progress tracking works
- [x] Unit tests passing with 95%+ coverage

## Implementation Notes
- Created `ConfidenceIndicator` component at `frontend/src/features/verification/components/ConfidenceIndicator.tsx` (87 lines)
- Created `VerificationSummary` component at `frontend/src/features/verification/components/VerificationSummary.tsx` (79 lines)
- Implemented 37 comprehensive tests (18 + 19):
  - ConfidenceIndicator tests (18 tests):
    - Confidence level classification (3 tests)
    - Badge display (4 tests)
    - Color coding (3 tests)
    - Tooltip display (6 tests)
    - Custom styling (2 tests)
  - VerificationSummary tests (19 tests):
    - Progress display (5 tests)
    - Low confidence filter (7 tests)
    - Low confidence count (3 tests)
    - Custom styling (2 tests)
    - Edge cases (2 tests)
- ConfidenceIndicator features:
  - Three-tier classification: high (≥90%), medium (70-89%), low (<70%)
  - Color-coded badges: green (high), amber (medium), red (low)
  - Tooltip with confidence label and source text preview
  - Source text truncation at 100 characters
  - Exported getConfidenceLevel utility function
- VerificationSummary features:
  - Progress bar showing verification completion percentage
  - Count display (verified/total)
  - Low-confidence filter button (only shown when low-confidence fields exist)
  - Filter toggle between 'all' and 'low' modes
  - AlertTriangle icon for visual emphasis
  - Exported FieldSourceReference interface
- All 37 tests pass with full coverage
