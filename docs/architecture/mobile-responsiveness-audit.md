# Mobile Responsiveness Audit

## Overview
This document tracks the mobile responsiveness audit and fixes for all pages in the CapVeri application.

**Audit Date**: 2024-12-31
**Breakpoints Tested**:
- Mobile: 375px (iPhone SE)
- Tablet: 768px
- Laptop: 1024px

**Touch Target Minimum**: 44x44px

## Infrastructure Complete ✅

The following responsive infrastructure is available for use:

### Hooks
- `useMediaQuery(query: string)` - Check if media query matches
- `useViewport()` - Get current viewport info (isMobile, isTablet, isLaptop, isDesktop, size, isTouch)

### Components
- `ResponsiveTableWrapper` - Switches between table and card views based on viewport

### Breakpoints
```typescript
export const BREAKPOINTS = {
  mobile: 375,  // iPhone SE, small phones
  sm: 640,      // Large phones
  md: 768,      // Tablets
  lg: 1024,     // Laptops
  xl: 1280,     // Desktops
  '2xl': 1536,  // Large desktops
}
```

## Pages Inventory

### Auth Pages (4 pages)
| Page | Path | Status | Issues | Notes |
|------|------|--------|--------|-------|
| LoginPage | /auth/login | ✅ Good | None | Already uses responsive padding (px-4 sm:px-6 lg:px-8), max-w-md container |
| RegisterPage | /auth/register | ✅ Good | None | Already uses responsive padding (px-4 sm:px-6 lg:px-8), max-w-md container |
| ForgotPasswordPage | /auth/forgot-password | ✅ Good | None | Already uses responsive padding (px-4 sm:px-6 lg:px-8), max-w-md container |
| AuthCallback | /auth/callback | ✅ Good | None | Already uses responsive padding and max-w-md container |

### Property Pages (4 pages)
| Page | Path | Status | Issues | Notes |
|------|------|--------|--------|-------|
| PropertyListPage | /properties | ✅ Fixed | - | Added ResponsiveTableWrapper + PropertyCard component for mobile. Shows cards on mobile, table on desktop. |
| PropertyDetailPage | /properties/:id | 🔍 To Audit | - | Uses cards/tabs which should stack naturally |
| PropertyFormPage | /properties/new | 🔍 To Audit | - | - |
| PropertyOverviewTab | (tab) | 🔍 To Audit | - | - |

### Lease Pages (1 page)
| Page | Path | Status | Issues | Notes |
|------|------|--------|--------|-------|
| LeaseFormPage | /leases/new | 🔍 To Audit | - | - |

### Extraction Pages (2 pages)
| Page | Path | Status | Issues | Notes |
|------|------|--------|--------|-------|
| ExtractionsPage | /extractions | 🔍 To Audit | Likely has DataTable | Needs ResponsiveTableWrapper |
| VerificationPage | /extractions/:id/verify | ✅ Fixed | - | VerificationLayout now stacks vertically on mobile/tablet, side-by-side on desktop |

### Analysis Pages (2 pages)
| Page | Path | Status | Issues | Notes |
|------|------|--------|--------|-------|
| YearOverYearPage | /analysis/yoy | 🔍 To Audit | Complex table, filters may overflow | - |
| TrendAnalysisPage | /analysis/trends | 🔍 To Audit | Charts need responsive sizing | - |

### Settings Pages (4 pages)
| Page | Path | Status | Issues | Notes |
|------|------|--------|--------|-------|
| ProfilePage | /settings/profile | 🔍 To Audit | - | - |
| OrganizationPage | /settings/organization | 🔍 To Audit | - | - |
| Billing | /settings/billing | 🔍 To Audit | - | - |
| Invoices | /settings/invoices | 🔍 To Audit | Likely has DataTable | - |

### Admin Pages (1 page)
| Page | Path | Status | Issues | Notes |
|------|------|--------|--------|-------|
| Feedback | /admin/feedback | 🔍 To Audit | - | - |

### Checkout/Pricing Pages (3 pages)
| Page | Path | Status | Issues | Notes |
|------|------|--------|--------|-------|
| Pricing | /pricing | 🔍 To Audit | Pricing cards may need stacking | - |
| Checkout | /checkout | 🔍 To Audit | - | - |
| CheckoutSuccess | /checkout/success | 🔍 To Audit | - | - |

## Common Mobile Issues & Patterns

### Issue Categories

#### 1. Tables (High Priority)
**Problem**: Tables with many columns cause horizontal scrolling on mobile.
**Solution**: Use `ResponsiveTableWrapper` to show cards on mobile, table on desktop.

**Example Implementation**:
```tsx
import { ResponsiveTableWrapper } from '@/components/ui/data-table/ResponsiveTableWrapper'
import { useViewport } from '@/hooks/useViewport'

function MyListPage() {
  const { isMobile } = useViewport()

  return (
    <ResponsiveTableWrapper
      table={
        <DataTable
          columns={columns}
          data={data}
          onRowClick={handleRowClick}
        />
      }
      mobileCards={
        data.map(item => (
          <ItemCard
            key={item.id}
            item={item}
            onClick={() => handleRowClick(item)}
          />
        ))
      }
    />
  )
}
```

**Pages Affected**:
- PropertyListPage
- ExtractionsPage
- Invoices
- YearOverYearPage
- Any page using DataTable

#### 2. Split Views (High Priority)
**Problem**: Side-by-side layouts (PDF + form) don't work on mobile.
**Solution**: Stack vertically on mobile, side-by-side on tablet+.

**Example Implementation**:
```tsx
import { useViewport } from '@/hooks/useViewport'

function SplitViewPage() {
  const { isMobile } = useViewport()

  return (
    <div className={cn(
      "flex gap-4",
      isMobile ? "flex-col" : "flex-row"
    )}>
      <div className={cn(isMobile ? "w-full" : "w-1/2")}>
        {/* Left panel */}
      </div>
      <div className={cn(isMobile ? "w-full" : "w-1/2")}>
        {/* Right panel */}
      </div>
    </div>
  )
}
```

**Pages Affected**:
- VerificationPage (PDF + form)
- Any detail page with sidebar

#### 3. Fixed Widths (Medium Priority)
**Problem**: `max-w-md` or fixed width elements don't adapt to small screens.
**Solution**: Use responsive width utilities.

**Example Fix**:
```tsx
// Before
<div className="max-w-md">

// After
<div className="w-full max-w-md px-4">
```

**Pages Affected**:
- PropertyListPage (search bar)
- Any form with max-width constraints

#### 4. Modals/Dialogs (Medium Priority)
**Problem**: Modals may not fit on mobile screens.
**Solution**: Use full-screen modals on mobile.

**Example Implementation**:
```tsx
import { useViewport } from '@/hooks/useViewport'

function MyDialog() {
  const { isMobile } = useViewport()

  return (
    <DialogContent className={cn(
      isMobile ? "w-screen h-screen max-w-none" : "max-w-2xl"
    )}>
      {/* Dialog content */}
    </DialogContent>
  )
}
```

#### 5. Forms (Medium Priority)
**Problem**: Form inputs need proper mobile keyboards (email, tel, number).
**Solution**: Use correct input types and inputMode.

**Example**:
```tsx
<Input
  type="email"
  inputMode="email"
  autoComplete="email"
/>

<Input
  type="tel"
  inputMode="tel"
  autoComplete="tel"
/>

<Input
  type="text"
  inputMode="numeric"
  pattern="[0-9]*"
/>
```

#### 6. Touch Targets (High Priority)
**Problem**: Buttons and links smaller than 44x44px are hard to tap.
**Solution**: Ensure minimum touch target size with padding.

**Example**:
```tsx
// Before
<button className="p-1">

// After
<button className="p-3 min-h-[44px] min-w-[44px]">
```

#### 7. Horizontal Padding (High Priority)
**Problem**: Content touches screen edges on mobile.
**Solution**: Add responsive horizontal padding.

**Example**:
```tsx
<div className="px-4 sm:px-6 lg:px-8">
  {/* Content */}
</div>
```

## Testing Checklist

For each page, verify:

- [ ] **No horizontal scroll** at 375px, 768px, 1024px
- [ ] **Text readable** without zooming (minimum 16px base font)
- [ ] **Touch targets** minimum 44x44px for all interactive elements
- [ ] **Forms** use correct input types and mobile keyboards
- [ ] **Tables** convert to cards or have horizontal scroll container on mobile
- [ ] **Modals** properly sized for mobile (full-screen or appropriately sized)
- [ ] **Images** responsive and don't overflow
- [ ] **Navigation** accessible and usable on mobile
- [ ] **Content** properly stacks on mobile (no overlapping)
- [ ] **Spacing** adequate between elements for touch interaction

## Implementation Plan

### Phase 1: High Priority Pages (Core Workflows)
1. VerificationPage (split view + form)
2. PropertyListPage (table)
3. ExtractionsPage (table)
4. YearOverYearPage (complex table)

### Phase 2: Forms & Detail Pages
1. PropertyFormPage
2. LeaseFormPage
3. PropertyDetailPage

### Phase 3: Settings & Admin
1. ProfilePage
2. OrganizationPage
3. Billing
4. Invoices
5. Feedback

### Phase 4: Public Pages
1. RegisterPage
2. ForgotPasswordPage
3. Pricing
4. Checkout
5. CheckoutSuccess

### Phase 5: Secondary Pages
1. TrendAnalysisPage
2. AuthCallback
3. PropertyOverviewTab

## Mobile Patterns Documentation

### Pattern 1: Responsive Container
```tsx
<div className="container mx-auto px-4 sm:px-6 lg:px-8">
  {/* Content auto-adjusts padding by breakpoint */}
</div>
```

### Pattern 2: Conditional Rendering
```tsx
const { isMobile, isTablet } = useViewport()

return (
  <>
    {isMobile && <MobileView />}
    {!isMobile && <DesktopView />}
  </>
)
```

### Pattern 3: Responsive Grid
```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
  {/* Automatically stacks on mobile, 2 cols on tablet, 3 on desktop */}
</div>
```

### Pattern 4: Responsive Flex
```tsx
<div className="flex flex-col md:flex-row gap-4">
  {/* Stacks vertically on mobile, horizontal on md+ */}
</div>
```

### Pattern 5: Responsive Text
```tsx
<h1 className="text-2xl sm:text-3xl lg:text-4xl">
  {/* Text size increases with screen size */}
</h1>
```

## Progress Tracking

**Total Pages**: 21
**Audited**: 6 ✅ (Auth pages + 2 property/extraction pages)
**Fixed**: 2 🔧 (PropertyListPage, VerificationPage)
**Already Responsive**: 4 ✅ (All auth pages)
**Remaining**: 15 🔍

### Completed Fixes

1. **PropertyListPage** - Added `ResponsiveTableWrapper` with `PropertyCard` component
   - Desktop: Shows data table with sorting/pagination
   - Mobile: Shows card list with touch-friendly tap targets
   - Test coverage: 3 tests for PropertyCard

2. **VerificationPage** - Updated `VerificationLayout` component
   - Desktop: Side-by-side split view with resizable divider
   - Mobile/Tablet: Stacked vertically (PDF top, form bottom)
   - Test coverage: All 19 existing tests still passing

### Key Patterns Established

- **Table-to-Cards Pattern**: Use `ResponsiveTableWrapper` with mobile card components
- **Split View Pattern**: Use conditional rendering based on `useViewport` hook
- **Touch Targets**: Minimum 44x44px for buttons (`min-h-[44px]`)
- **Responsive Padding**: Use `px-4 sm:px-6 lg:px-8` for page containers

**Status Legend**:
- ✅ Good: No issues found or all issues fixed
- 🔧 Fixed: Mobile responsiveness issues fixed
- 🔄 In Progress: Currently being fixed
- 🔍 To Audit: Not yet audited
- ⚠️ Issues Found: Needs fixes
