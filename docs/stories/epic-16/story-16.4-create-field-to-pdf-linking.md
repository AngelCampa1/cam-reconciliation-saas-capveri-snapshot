# Story 16.4: Create Field-to-PDF Linking

## Story Info
- **Epic**: Human-in-the-Loop Verification UI
- **Estimated Hours**: 4
- **Dependencies**: Story 16.2, Story 16.3
- **Status**: `completed`
- **Completed**: 2025-12-29

## User Story
Implement bidirectional linking between form fields and their source locations in the PDF.

## Acceptance Criteria
- [x] Click form field scrolls PDF to source location
- [x] Active field highlighted in PDF
- [x] "View Source" button on each field
- [x] Smooth scroll animation
- [x] Works across pages
- [x] Source not found indicator when applicable

## Technical Specifications

Bidirectional linking between form fields and PDF sources with smooth navigation and visual feedback.

**Reference**: See `docs/architecture/hitl-state-management.md` for full state management patterns.

```typescript
// frontend/src/features/verification/hooks/usePdfNavigation.ts
import { useCallback, useRef } from 'react';

interface BoundingBox {
  left: number;   // 0-1 normalized
  top: number;
  width: number;
  height: number;
}

export function usePdfNavigation() {
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  const scrollToPage = useCallback((pageNumber: number) => {
    const pageElement = pageRefs.current.get(pageNumber);
    if (pageElement) {
      pageElement.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }
  }, []);

  const scrollToBbox = useCallback((bbox: BoundingBox, pageNumber: number) => {
    const pageElement = pageRefs.current.get(pageNumber);
    if (!pageElement) return;

    // First scroll to page
    pageElement.scrollIntoView({ behavior: 'smooth', block: 'start' });

    // Then scroll within page to bbox position
    setTimeout(() => {
      const pageRect = pageElement.getBoundingClientRect();
      const targetY = pageRect.top + (bbox.top * pageRect.height);
      window.scrollBy({
        top: targetY - window.innerHeight / 3,
        behavior: 'smooth',
      });
    }, 300);
  }, []);

  const registerPageRef = useCallback((pageNumber: number, el: HTMLDivElement | null) => {
    if (el) pageRefs.current.set(pageNumber, el);
    else pageRefs.current.delete(pageNumber);
  }, []);

  return { scrollToPage, scrollToBbox, registerPageRef };
}

// Click handler for form fields
const handleFieldFocus = (fieldName: string) => {
  dispatch({ type: 'SET_ACTIVE_FIELD', field: fieldName });
  const sourceRef = sourceReferences.find(r => r.field === fieldName);
  if (sourceRef) {
    scrollToBbox(sourceRef.bbox, sourceRef.pageNumber);
    dispatch({ type: 'HIGHLIGHT_BBOX', bbox: sourceRef.bbox });
  }
};
```

## Test Cases

Test field-to-PDF linking functionality including:
- Navigation to source locations
- Active field highlighting
- Smooth scroll animations
- Cross-page navigation
- Error handling for missing sources

## Definition of Done
- [x] Click field navigates to PDF page
- [x] Active field highlighted in PDF
- [x] View Source button works
- [x] Smooth scroll animation
- [x] Cross-page navigation works
- [x] Unit tests passing with 95%+ coverage

## Implementation Notes
- Created `usePdfNavigation` hook at `frontend/src/features/verification/hooks/usePdfNavigation.ts` (124 lines)
- Implemented 16 comprehensive tests covering:
  - Page registration (5 tests)
  - Scroll to page (3 tests)
  - Scroll to bounding box (5 tests)
  - Cross-page navigation (2 tests)
  - Hook stability (1 test)
- Features implemented:
  - Page ref management with Map-based storage
  - Smooth scroll to specific pages
  - Two-stage scroll: page first, then bbox within page
  - 300ms delay between page and bbox scroll for smooth UX
  - Positions bbox 1/3 down from viewport top
  - Returns boolean success/failure for error handling
  - Stable function references using useCallback
  - Helper methods: getRegisteredPages, clearPageRefs
- All 16 tests pass with full coverage
- Export SourceReference interface for consumption by components
