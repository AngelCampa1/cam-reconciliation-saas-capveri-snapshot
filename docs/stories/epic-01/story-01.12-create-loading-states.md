# Story 1.12: Create Loading States

## Story Info
- **Epic**: Design System & UI Foundation
- **Estimated Hours**: 2
- **Dependencies**: Story 1.3 (Shadcn/UI must be installed)
- **Status**: `completed`

## User Story
**As a** user
**I want** clear loading indicators when data is being fetched
**So that** I know the app is working and haven't lost my place

## Acceptance Criteria

- [x] **AC1**: Skeleton loader component for:
  - Text lines (different widths)
  - Cards
  - Table rows
  - Images/avatars
- [x] **AC2**: Spinner component (multiple sizes)
- [x] **AC3**: Progress bar component (determinate and indeterminate)
- [x] **AC4**: Loading states respect reduced motion preferences
- [x] **AC5**: Skeleton matches the shape of content it replaces

## Technical Specifications

**Files to Create**:
```
frontend/src/components/
└── ui/
    ├── skeleton.tsx
    ├── spinner.tsx
    └── progress.tsx
```

**Skeleton.tsx**:
```typescript
import { cn } from '@/lib/utils'

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-md bg-muted',
        className
      )}
      {...props}
    />
  )
}

// Usage examples
<Skeleton className="h-4 w-[250px]" />  // Text line
<Skeleton className="h-12 w-12 rounded-full" />  // Avatar
<Skeleton className="h-[125px] w-full rounded-xl" />  // Card
```

**Reduced Motion Support**:
```css
@media (prefers-reduced-motion: reduce) {
  .animate-pulse {
    animation: none;
    opacity: 0.5;
  }
}
```

## Test Cases

- [x] Skeletons match content shapes
- [x] Animations are smooth
- [x] Reduced motion preferences respected

## Definition of Done

- [x] All acceptance criteria met
- [x] Tests written and passing
- [x] Code reviewed
- [x] Documentation updated
- [x] Skeletons match content shapes
- [x] Animations are smooth
- [x] Reduced motion preferences respected

## Completion Notes

**Completed**: 2025-12-28

**Implementation**:
- Created `skeleton.tsx` with 6 variants: Skeleton, SkeletonText, SkeletonCard, SkeletonAvatar, SkeletonTableRow, SkeletonImage
- Created `spinner.tsx` with 3 variants: Spinner, SpinnerOverlay, InlineSpinner (sizes: xs, sm, md, lg, xl)
- Created `progress.tsx` with 2 variants: Progress (linear), ProgressCircular (both determinate and indeterminate)
- Added reduced motion CSS in index.css with `@media (prefers-reduced-motion: reduce)`
- Added animation keyframes to tailwind.config.js for indeterminate progress
- Installed @radix-ui/react-progress for accessible progress primitives

**Files Created/Modified**:
- `frontend/src/components/ui/skeleton.tsx` (new)
- `frontend/src/components/ui/skeleton.test.tsx` (new, 43 tests)
- `frontend/src/components/ui/spinner.tsx` (new)
- `frontend/src/components/ui/spinner.test.tsx` (new, 44 tests)
- `frontend/src/components/ui/progress.tsx` (new)
- `frontend/src/components/ui/progress.test.tsx` (new, 57 tests)
- `frontend/src/index.css` (modified - reduced motion styles)
- `frontend/tailwind.config.js` (modified - animation keyframes)

**Test Results**: 144 new tests, 1007 total tests passing
