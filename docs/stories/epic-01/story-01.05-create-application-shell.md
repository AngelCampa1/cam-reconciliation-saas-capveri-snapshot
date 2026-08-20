# Story 1.5: Create Application Shell

## Story Info
- **Epic**: Design System & UI Foundation
- **Estimated Hours**: 4
- **Dependencies**: Story 1.4 (Shadcn theme must be customized)
- **Status**: `completed`

## User Story
**As a** user
**I want** a consistent layout with header, sidebar, and main content area
**So that** I can easily navigate the application and always know where I am

## Acceptance Criteria

- [x] **AC1**: Header component with:
  - Logo/app name on left
  - User menu (avatar, dropdown) on right
  - Consistent height (64px)
- [x] **AC2**: Sidebar component with:
  - Collapsible on desktop (icon-only mode)
  - Hidden on mobile (hamburger menu trigger)
  - Navigation items with icons
  - Active state indication
- [x] **AC3**: Main content area that:
  - Fills remaining space
  - Has consistent padding
  - Scrolls independently of sidebar
- [x] **AC4**: Responsive layout works at all breakpoints:
  - Desktop (> 1024px): sidebar + content side by side
  - Tablet (768px - 1024px): collapsible sidebar
  - Mobile (< 768px): hidden sidebar, hamburger menu
- [x] **AC5**: Smooth transitions when sidebar collapses/expands

## Technical Specifications

**Files to Create**:
```
frontend/src/
├── components/
│   └── layout/
│       ├── AppShell.tsx
│       ├── Header.tsx
│       ├── Sidebar.tsx
│       └── MainContent.tsx
└── hooks/
    └── useSidebarState.ts
```

**AppShell.tsx Structure**:
```typescript
interface AppShellProps {
  children: React.ReactNode
}

export function AppShell({ children }: AppShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        mobileOpen={mobileMenuOpen}
        onMobileClose={() => setMobileMenuOpen(false)}
      />

      {/* Main area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header
          onMenuClick={() => setMobileMenuOpen(true)}
        />
        <MainContent>
          {children}
        </MainContent>
      </div>
    </div>
  )
}
```

**Responsive Breakpoints**:
- Mobile: < 768px (sidebar hidden, hamburger menu)
- Tablet: 768px - 1024px (collapsible sidebar)
- Desktop: > 1024px (full sidebar)

## Test Cases

- [x] Layout renders correctly at all breakpoints
- [x] Sidebar collapse animation is smooth (200ms transition)
- [x] Mobile menu opens/closes correctly
- [x] Content area scrolls independently

## Definition of Done

- [x] All acceptance criteria met
- [x] Tests written and passing (106 tests in 4 test files)
- [x] Code reviewed
- [x] Documentation updated

## Implementation Notes

**Files Created:**
- `frontend/src/hooks/useSidebarState.ts` - Custom hook for sidebar state with localStorage persistence
- `frontend/src/components/layout/Header.tsx` - Header with logo, hamburger menu, user dropdown
- `frontend/src/components/layout/Sidebar.tsx` - Collapsible desktop + mobile overlay sidebar
- `frontend/src/components/layout/MainContent.tsx` - Scrollable content area with responsive padding
- `frontend/src/components/layout/AppShell.tsx` - Main shell combining all components
- `frontend/src/components/layout/index.ts` - Barrel export

**Test Coverage:**
- useSidebarState: 14 tests
- Header: 23 tests
- Sidebar: 31 tests
- MainContent: 12 tests
- AppShell: 26 tests
- Total: 106 tests, all passing

**Completed**: 2025-12-28

---

## Future Integration Points

**Epic 23 (Feedback Widget) - Story 23.2**:
The FeedbackWidget component should be added to the AppShell after Epic 23 is implemented:

```typescript
export function AppShell({ children }: AppShellProps) {
  // ... existing code ...

  return (
    <div className="flex h-screen bg-background">
      <Sidebar ... />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header ... />
        <MainContent>{children}</MainContent>
      </div>

      {/* Feedback Widget - Added by Epic 23 */}
      <FeedbackWidget position="bottom-right" />
    </div>
  )
}
```

> **Note**: The FeedbackWidget renders a floating button that opens a feedback form sheet. It should be positioned outside the main layout flow.
