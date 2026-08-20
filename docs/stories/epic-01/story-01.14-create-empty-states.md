# Story 1.14: Create Empty States

## Story Info
- **Epic**: Design System & UI Foundation
- **Estimated Hours**: 2
- **Dependencies**: Story 1.3 (Shadcn/UI must be installed)
- **Status**: `completed`

## User Story
**As a** user
**I want** helpful empty states when lists have no data
**So that** I understand why the list is empty and what action to take

## Acceptance Criteria

- [x] **AC1**: Empty state component with:
  - Illustration/icon
  - Title
  - Description
  - Call-to-action button
- [x] **AC2**: Contextual variants for different entities:
  - No properties
  - No leases
  - No imports
  - No search results
- [x] **AC3**: Illustrations are simple, on-brand
- [x] **AC4**: CTA leads to relevant action (e.g., "Add Property")

## Technical Specifications

**Files to Create**:
```
frontend/src/components/
└── EmptyState.tsx
```

**EmptyState.tsx**:
```typescript
interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description: string
  action?: {
    label: string
    onClick: () => void
  }
}

export function EmptyState({
  icon: Icon = FolderOpen,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="rounded-full bg-muted p-4 mb-4">
        <Icon className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-medium mb-1">{title}</h3>
      <p className="text-muted-foreground mb-4 max-w-sm">
        {description}
      </p>
      {action && (
        <Button onClick={action.onClick}>
          <Plus className="mr-2 h-4 w-4" />
          {action.label}
        </Button>
      )}
    </div>
  )
}
```

**Usage Examples**:
```typescript
// Properties list empty
<EmptyState
  icon={Building2}
  title="No properties yet"
  description="Get started by adding your first commercial property to manage."
  action={{
    label: 'Add Property',
    onClick: () => navigate('/properties/new'),
  }}
/>

// Search with no results
<EmptyState
  icon={Search}
  title="No results found"
  description="Try adjusting your search terms or filters."
/>
```

## Test Cases

- [x] Empty states render for all list views
- [x] CTAs navigate to correct pages
- [x] Visual design is consistent with brand

## Definition of Done

- [x] All acceptance criteria met
- [x] Tests written and passing
- [x] Code reviewed
- [x] Documentation updated
- [x] Empty states render for all list views
- [x] CTAs navigate to correct pages
- [x] Visual design is consistent with brand

## Completion Notes

**Completed**: 2025-12-28

**Implementation**:
- Created `EmptyState.tsx` base component with CVA variants (sm, md, lg)
- Implemented 7 preset empty state components:
  - `EmptyStateNoProperties` - For empty property lists
  - `EmptyStateNoLeases` - For empty lease lists
  - `EmptyStateNoImports` - For empty import/upload lists
  - `EmptyStateNoSearchResults` - For search with no results (includes query display)
  - `EmptyStateNoTenants` - For empty tenant lists
  - `EmptyStateNoReconciliations` - For empty reconciliation lists
  - `EmptyStateNoData` - Generic fallback for any empty data
- Features: icon customization, primary/secondary actions, size variants
- Proper ARIA attributes (role="status", aria-label, aria-hidden on icons)
- Lucide icons for consistent visual design

**Files Created/Modified**:
- `frontend/src/components/EmptyState.tsx` (new)
- `frontend/src/components/EmptyState.test.tsx` (new, 55 tests)

**Test Results**: 55 new tests, 1134 total tests passing
