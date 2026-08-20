# Story 1.7: Create Page Header Component

## Story Info
- **Epic**: Design System & UI Foundation
- **Estimated Hours**: 2
- **Dependencies**: Story 1.4 (Shadcn theme must be customized)
- **Status**: `completed`

## User Story
**As a** user
**I want** each page to have a consistent header with breadcrumbs and actions
**So that** I know where I am and can quickly access page-specific actions

## Acceptance Criteria

- [x] **AC1**: Breadcrumb trail shows navigation path
- [x] **AC2**: Page title is prominent (h1)
- [x] **AC3**: Optional description/subtitle supported
- [x] **AC4**: Action buttons slot on the right side
- [x] **AC5**: Responsive: stacks vertically on mobile
- [x] **AC6**: Breadcrumbs are clickable links (except current page)

## Technical Specifications

**Files to Create**:
```
frontend/src/components/
├── PageHeader.tsx
└── Breadcrumbs.tsx
```

**PageHeader.tsx**:
```typescript
interface PageHeaderProps {
  title: string
  description?: string
  breadcrumbs?: BreadcrumbItem[]
  actions?: React.ReactNode
}

interface BreadcrumbItem {
  label: string
  href?: string  // undefined = current page (not a link)
}

export function PageHeader({
  title,
  description,
  breadcrumbs,
  actions
}: PageHeaderProps) {
  return (
    <div className="mb-8">
      {breadcrumbs && <Breadcrumbs items={breadcrumbs} />}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {description && (
            <p className="mt-1 text-muted-foreground">{description}</p>
          )}
        </div>

        {actions && (
          <div className="flex items-center gap-2">
            {actions}
          </div>
        )}
      </div>
    </div>
  )
}
```

**Usage Example**:
```typescript
<PageHeader
  title="Properties"
  description="Manage your commercial properties"
  breadcrumbs={[
    { label: 'Dashboard', href: '/' },
    { label: 'Properties' }
  ]}
  actions={
    <Button>
      <Plus className="mr-2 h-4 w-4" />
      Add Property
    </Button>
  }
/>
```

## Test Cases

- [x] Breadcrumbs render and link correctly
- [x] Title hierarchy is semantic (h1)
- [x] Actions align right on desktop, stack on mobile

## Definition of Done

- [x] All acceptance criteria met
- [x] Tests written and passing (57 tests for PageHeader + Breadcrumbs)
- [x] Code reviewed
- [x] Documentation updated
- [x] Breadcrumbs render and link correctly
- [x] Title hierarchy is semantic (h1)
- [x] Actions align right on desktop, stack on mobile

## Implementation Notes

**Completed**: 2025-12-28

**Files Created**:
- `frontend/src/components/layout/Breadcrumbs.tsx` - Breadcrumbs navigation component
- `frontend/src/components/layout/Breadcrumbs.test.tsx` - 25 tests for Breadcrumbs
- `frontend/src/components/layout/PageHeader.tsx` - Page header with title, description, breadcrumbs, actions
- `frontend/src/components/layout/PageHeader.test.tsx` - 32 tests for PageHeader
- `frontend/src/components/layout/index.ts` - Updated with exports

**Key Features**:
1. Semantic h1 title for accessibility
2. Optional description with muted foreground styling
3. Breadcrumbs with clickable links (current page as non-link span)
4. Home icon on first breadcrumb (configurable)
5. Chevron separators between items
6. Actions slot with gap-2 spacing
7. Responsive: flex-col on mobile, flex-row with justify-between on sm+
8. Full keyboard navigation and aria-current="page" for current breadcrumb
