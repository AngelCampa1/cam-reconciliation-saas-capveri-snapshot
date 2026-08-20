# Story 1.6: Create Sidebar Navigation

## Story Info
- **Epic**: Design System & UI Foundation
- **Estimated Hours**: 3
- **Dependencies**: Story 1.5 (Application shell must be created)
- **Status**: `completed`

## User Story
**As a** user
**I want** a navigation sidebar with clear sections and active states
**So that** I can quickly move between different areas of the application

## Acceptance Criteria

- [x] **AC1**: Navigation items include icon + label
- [x] **AC2**: Active item is visually distinct (background color, font weight)
- [x] **AC3**: Hover state provides feedback
- [x] **AC4**: Nested items supported (expandable sections)
- [x] **AC5**: Keyboard navigation works (Tab, Enter, Arrow keys)
- [x] **AC6**: Collapsed state shows only icons with tooltips
- [x] **AC7**: Screen reader announces current location

## Technical Specifications

**Files to Create**:
```
frontend/src/
├── components/
│   └── layout/
│       ├── Sidebar.tsx
│       ├── NavItem.tsx
│       └── NavSection.tsx
└── config/
    └── navigation.ts   (nav structure definition)
```

**navigation.ts** (structure definition):
```typescript
import {
  Building2,
  FileText,
  Calculator,
  Upload,
  Settings,
  Users,
} from 'lucide-react'

export interface NavItem {
  id: string
  label: string
  icon: LucideIcon
  href: string
  children?: NavItem[]
}

export const mainNavigation: NavItem[] = [
  {
    id: 'properties',
    label: 'Properties',
    icon: Building2,
    href: '/properties',
  },
  {
    id: 'leases',
    label: 'Leases',
    icon: FileText,
    href: '/leases',
  },
  {
    id: 'reconciliation',
    label: 'Reconciliation',
    icon: Calculator,
    href: '/reconciliation',
  },
  {
    id: 'imports',
    label: 'Data Imports',
    icon: Upload,
    href: '/imports',
  },
]

export const secondaryNavigation: NavItem[] = [
  {
    id: 'team',
    label: 'Team',
    icon: Users,
    href: '/team',
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: Settings,
    href: '/settings',
  },
]
```

**NavItem.tsx**:
```typescript
interface NavItemProps {
  item: NavItem
  isActive: boolean
  isCollapsed: boolean
}

export function NavItem({ item, isActive, isCollapsed }: NavItemProps) {
  const Icon = item.icon

  return (
    <Link
      to={item.href}
      className={cn(
        'flex items-center gap-3 rounded-lg px-3 py-2 transition-colors',
        'hover:bg-accent hover:text-accent-foreground',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        isActive && 'bg-accent text-accent-foreground font-medium'
      )}
      aria-current={isActive ? 'page' : undefined}
    >
      <Icon className="h-5 w-5 shrink-0" />
      {!isCollapsed && <span>{item.label}</span>}
    </Link>
  )
}
```

## Test Cases

- [x] All nav items render with icons
- [x] Active state clearly visible
- [x] Keyboard navigation functional
- [x] Collapsed mode shows tooltips on hover

## Definition of Done

- [x] All acceptance criteria met
- [x] Tests written and passing (560 tests)
- [x] Code reviewed
- [x] Documentation updated
- [x] All nav items render with icons
- [x] Active state clearly visible
- [x] Keyboard navigation functional
- [x] Collapsed mode shows tooltips on hover

## Implementation Notes

**Completed**: 2025-12-28

**Files Created/Modified**:
- `frontend/src/config/navigation.ts` - Navigation configuration with main and secondary sections
- `frontend/src/config/index.ts` - Barrel export for config
- `frontend/src/components/layout/NavItem.tsx` - NavItem and NavItemList components
- `frontend/src/components/layout/NavSection.tsx` - NavSection and SidebarNavigation components
- `frontend/src/components/layout/Sidebar.tsx` - Updated with nested navigation support
- `frontend/src/components/layout/index.ts` - Updated exports
- `frontend/src/config/navigation.test.ts` - 16 navigation config tests
- `frontend/src/components/layout/Sidebar.test.tsx` - 52 comprehensive sidebar tests

**Key Features Implemented**:
1. Nested/expandable navigation with recursive rendering
2. Full keyboard navigation (ArrowUp/Down/Left/Right/Home/End)
3. Tooltips in collapsed mode using Radix UI TooltipProvider
4. ARIA attributes for screen reader accessibility
5. Smooth 200ms transitions for all interactions

---

## Future Navigation Items (Integration Notes)

The following navigation items should be added when their respective epics are implemented:

**Epic 21 (Billing) - Add to secondaryNavigation**:
```typescript
{
  id: 'billing',
  label: 'Billing',
  icon: CreditCard,  // from lucide-react
  href: '/billing',
  children: [
    { id: 'subscription', label: 'Subscription', icon: Repeat, href: '/billing/subscription' },
    { id: 'invoices', label: 'Invoices', icon: Receipt, href: '/billing/invoices' },
    { id: 'payment-methods', label: 'Payment Methods', icon: Wallet, href: '/billing/payment-methods' },
  ],
}
```

**Epic 22 (Promotions) - Add to adminNavigation (admin-only)**:
```typescript
{
  id: 'promotions',
  label: 'Promotions',
  icon: Tag,  // from lucide-react
  href: '/admin/promotions',
}
```

**Epic 23 (Feedback Admin) - Add to adminNavigation (admin-only)**:
```typescript
{
  id: 'feedback',
  label: 'Feedback',
  icon: MessageSquare,  // from lucide-react
  href: '/admin/feedback',
}
```

> **Note**: Create an `adminNavigation` array for admin-only nav items that are conditionally rendered based on user role.
