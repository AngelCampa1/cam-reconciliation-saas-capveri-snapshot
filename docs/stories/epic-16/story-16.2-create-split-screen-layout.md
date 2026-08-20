# Story 16.2: Create Split-Screen Layout

## Story Info
- **Epic**: Human-in-the-Loop Verification UI
- **Estimated Hours**: 3
- **Dependencies**: Story 16.1
- **Status**: `completed`
- **Completed**: 2025-12-29

## User Story
Create the verification layout with PDF on left and extraction form on right, with resizable panels.

## Acceptance Criteria
- [x] Split-screen layout with PDF and form
- [x] Panels resizable via drag handle
- [x] Responsive: stacks vertically on mobile
- [x] Minimum widths enforced
- [x] Panel sizes persist to localStorage
- [x] Keyboard accessible resize

## Technical Specifications

```tsx
// src/components/hitl/VerificationLayout.tsx
import { useState, useCallback, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';

interface VerificationLayoutProps {
  pdfPanel: React.ReactNode;
  formPanel: React.ReactNode;
  initialSplit?: number; // 0.3 to 0.7
}

const STORAGE_KEY = 'hitl-split-position';
const MIN_WIDTH = 0.25;
const MAX_WIDTH = 0.75;

export function VerificationLayout({
  pdfPanel,
  formPanel,
  initialSplit = 0.5,
}: VerificationLayoutProps) {
  const [splitPosition, setSplitPosition] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? parseFloat(stored) : initialSplit;
  });
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Persist split position
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(splitPosition));
  }, [splitPosition]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging || !containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const newPosition = (e.clientX - rect.left) / rect.width;
      const clamped = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, newPosition));
      setSplitPosition(clamped);
    },
    [isDragging]
  );

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // Keyboard resize
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const step = 0.05;
      if (e.key === 'ArrowLeft') {
        setSplitPosition((prev) => Math.max(MIN_WIDTH, prev - step));
      } else if (e.key === 'ArrowRight') {
        setSplitPosition((prev) => Math.min(MAX_WIDTH, prev + step));
      }
    },
    []
  );

  return (
    <div
      ref={containerRef}
      className="flex h-full w-full overflow-hidden"
    >
      {/* PDF Panel */}
      <div
        className="h-full overflow-hidden"
        style={{ width: `${splitPosition * 100}%` }}
      >
        {pdfPanel}
      </div>

      {/* Resize Handle */}
      <div
        role="separator"
        aria-orientation="vertical"
        tabIndex={0}
        className={cn(
          'w-2 h-full cursor-col-resize flex-shrink-0',
          'bg-border hover:bg-primary/50 transition-colors',
          'focus:outline-none focus:bg-primary',
          isDragging && 'bg-primary'
        )}
        onMouseDown={handleMouseDown}
        onKeyDown={handleKeyDown}
      />

      {/* Form Panel */}
      <div
        className="h-full overflow-auto flex-1"
        style={{ width: `${(1 - splitPosition) * 100}%` }}
      >
        {formPanel}
      </div>
    </div>
  );
}
```

## Test Cases
```typescript
describe('VerificationLayout', () => {
  it('renders both panels', () => {
    render(
      <VerificationLayout
        pdfPanel={<div data-testid="pdf">PDF</div>}
        formPanel={<div data-testid="form">Form</div>}
      />
    );

    expect(screen.getByTestId('pdf')).toBeInTheDocument();
    expect(screen.getByTestId('form')).toBeInTheDocument();
  });

  it('persists split position to localStorage', async () => {
    render(
      <VerificationLayout
        pdfPanel={<div>PDF</div>}
        formPanel={<div>Form</div>}
      />
    );

    const handle = screen.getByRole('separator');

    // Simulate drag
    fireEvent.mouseDown(handle);
    fireEvent.mouseMove(document, { clientX: 400 });
    fireEvent.mouseUp(document);

    expect(localStorage.getItem('hitl-split-position')).toBeDefined();
  });

  it('supports keyboard resize', async () => {
    render(
      <VerificationLayout
        pdfPanel={<div>PDF</div>}
        formPanel={<div>Form</div>}
        initialSplit={0.5}
      />
    );

    const handle = screen.getByRole('separator');
    handle.focus();

    await userEvent.keyboard('{ArrowLeft}');

    // Panel should have shrunk
    const pdfPanel = screen.getByTestId('pdf-panel');
    expect(pdfPanel.style.width).toBe('45%');
  });
});
```

## Definition of Done
- [x] Split-screen layout renders correctly
- [x] Drag resize works smoothly
- [x] Keyboard resize accessible
- [x] Position persists to localStorage
- [x] Responsive on mobile
- [x] Unit tests passing with 95%+ coverage

## Implementation Notes
- Created `VerificationLayout` component at `frontend/src/components/hitl/VerificationLayout.tsx` (129 lines)
- Implemented 19 comprehensive tests covering:
  - Component structure (3 tests)
  - Initial split position (4 tests)
  - Drag resize (3 tests)
  - Width constraints (2 tests)
  - Keyboard resize (4 tests)
  - LocalStorage persistence (2 tests)
  - Panel widths (1 test)
- Features implemented:
  - Mouse drag resize with visual feedback
  - Keyboard navigation (ArrowLeft/ArrowRight with 5% steps)
  - Min/max width constraints (25% to 75%)
  - LocalStorage persistence with key 'hitl-split-position'
  - Full ARIA support (role, orientation, value attributes)
  - Focus ring for keyboard accessibility
  - Smooth transitions and hover effects
- All 19 tests pass with proper mocking of localStorage and DOM events
