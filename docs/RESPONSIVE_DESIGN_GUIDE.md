# Responsive Design Guide - CapVeri

> Last Updated: 2024-12-30
> Status: Active

## Overview

This guide documents responsive design patterns, utilities, and best practices for CapVeri. All new features MUST follow these patterns to ensure consistent mobile experience across the platform.

---

## Table of Contents

1. [Breakpoints](#breakpoints)
2. [Viewport Detection](#viewport-detection)
3. [Responsive Patterns](#responsive-patterns)
4. [Touch Targets](#touch-targets)
5. [Testing Requirements](#testing-requirements)
6. [Component Guidelines](#component-guidelines)

---

## Breakpoints

We use Tailwind CSS breakpoints that align with common device sizes:

```typescript
export const BREAKPOINTS = {
  mobile: 375,  // iPhone SE, small phones
  sm: 640,      // Large phones
  md: 768,      // Tablets
  lg: 1024,     // Laptops
  xl: 1280,     // Desktops
  '2xl': 1536,  // Large desktops
} as const
```

### Testing Breakpoints

**REQUIRED**: All pages MUST be tested at these three critical breakpoints:

- **375px** - Mobile (iPhone SE, small phones)
- **768px** - Tablet (iPad, Android tablets)
- **1024px** - Laptop (MacBook Air, standard laptops)

### Tailwind Classes

Use Tailwind's responsive prefixes:

```tsx
// Mobile-first approach (default styles are mobile)
<div className="p-2 md:p-4 lg:p-6">
  {/* 8px padding on mobile, 16px on tablet, 24px on laptop+ */}
</div>
```

---

## Viewport Detection

### useViewport Hook

The primary hook for responsive design decisions:

```typescript
import { useViewport } from '@/hooks/useViewport'

function MyComponent() {
  const { isMobile, isTablet, isLaptop, isDesktop, size, isTouch } = useViewport()

  // Conditionally render based on viewport
  if (isMobile) {
    return <MobileView />
  }

  return <DesktopView />
}
```

**ViewportInfo Properties**:

| Property | Type | Description |
|----------|------|-------------|
| `width` | `number` | Current viewport width in pixels |
| `height` | `number` | Current viewport height in pixels |
| `isMobile` | `boolean` | `true` if <768px |
| `isTablet` | `boolean` | `true` if 768px-1023px |
| `isLaptop` | `boolean` | `true` if 1024px-1279px |
| `isDesktop` | `boolean` | `true` if >=1280px |
| `size` | `'mobile' \| 'tablet' \| 'laptop' \| 'desktop'` | Viewport category |
| `isTouch` | `boolean` | `true` if device supports touch |

### useMediaQuery Hook

For custom media queries:

```typescript
import { useMediaQuery } from '@/hooks/useMediaQuery'

function MyComponent() {
  const isPortrait = useMediaQuery('(orientation: portrait)')
  const prefersDark = useMediaQuery('(prefers-light-scheme: dark)')
  const isSmallHeight = useMediaQuery('(max-height: 600px)')

  // Use in conditional rendering
  return <div>{isPortrait ? 'Portrait' : 'Landscape'}</div>
}
```

---

## Responsive Patterns

### 1. Navigation

#### Desktop: Persistent Sidebar
```tsx
// Sidebar is always visible on desktop
<div className="hidden md:block md:w-64">
  <Sidebar />
</div>
```

#### Mobile: Hamburger Menu
```tsx
// Mobile uses sheet/drawer that slides in
<Sheet open={isSidebarOpen} onOpenChange={setIsSidebarOpen}>
  <SheetTrigger asChild>
    <Button variant="ghost" size="icon" className="md:hidden">
      <Menu />
    </Button>
  </SheetTrigger>
  <SheetContent side="left">
    <Sidebar />
  </SheetContent>
</Sheet>
```

### 2. Tables

#### Option A: Responsive Wrapper (Recommended)

Use `ResponsiveTableWrapper` to automatically switch between table and card views:

```tsx
import { ResponsiveTableWrapper } from '@/components/ui/data-table'

<ResponsiveTableWrapper
  table={<DataTable columns={columns} data={data} />}
  mobileCards={
    data.map(item => (
      <Card key={item.id} className="p-4">
        <h3 className="font-semibold">{item.name}</h3>
        <p className="text-sm text-muted-foreground">{item.description}</p>
      </Card>
    ))
  }
/>
```

#### Option B: Horizontal Scroll Container

For simple tables, wrap in horizontal scroll:

```tsx
<div className="overflow-x-auto">
  <table className="min-w-full">
    {/* table content */}
  </table>
</div>
```

**Note**: Always set `min-w-full` or a fixed `min-w-[600px]` to prevent table column collapsing.

### 3. Forms

#### Mobile Optimization Checklist

- [ ] Use appropriate input types (`tel`, `email`, `number`) to trigger correct mobile keyboards
- [ ] Group related fields to reduce scrolling
- [ ] Make labels visible (don't rely only on placeholders)
- [ ] Use large touch targets for buttons (44x44px minimum)
- [ ] Stack form fields vertically on mobile

```tsx
// Mobile-friendly form layout
<form className="space-y-4">
  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
    <div>
      <label htmlFor="email">Email</label>
      <input
        id="email"
        type="email"  {/* Triggers email keyboard on mobile */}
        className="w-full min-h-[44px]"  {/* 44px touch target */}
      />
    </div>
    <div>
      <label htmlFor="phone">Phone</label>
      <input
        id="phone"
        type="tel"  {/* Triggers phone keyboard on mobile */}
        className="w-full min-h-[44px]"
      />
    </div>
  </div>

  <Button
    type="submit"
    className="w-full md:w-auto min-h-[44px]"
  >
    Submit
  </Button>
</form>
```

### 4. Modals/Dialogs

#### Mobile Sizing

Modals should adapt to mobile screens:

```tsx
<Dialog>
  <DialogContent className="w-full max-w-md sm:max-w-lg md:max-w-2xl">
    {/* Modal content that grows with viewport */}
  </DialogContent>
</Dialog>

// For full-screen mobile modals:
<DialogContent className="w-full h-full md:h-auto md:max-w-2xl">
  {/* Full screen on mobile, dialog on desktop */}
</DialogContent>
```

### 5. Grid Layouts

Use responsive grid columns:

```tsx
// 1 column on mobile, 2 on tablet, 3 on laptop, 4 on desktop
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
  {items.map(item => <Card key={item.id}>{item.content}</Card>)}
</div>
```

### 6. Typography

Responsive font sizes:

```tsx
// Mobile: 24px, Tablet+: 32px, Laptop+: 36px
<h1 className="text-2xl md:text-3xl lg:text-4xl">
  Heading
</h1>

// Mobile: 14px, Tablet+: 16px
<p className="text-sm md:text-base">
  Body text
</p>
```

---

## Touch Targets

### Minimum Size Requirements

All interactive elements MUST meet these minimum sizes:

| Element Type | Minimum Size | Tailwind Class |
|--------------|--------------|----------------|
| Buttons | 44x44px | `min-h-[44px] min-w-[44px]` |
| Links | 44x44px (including padding) | `py-3` |
| Form Inputs | 44px height | `min-h-[44px]` |
| Checkboxes/Radio | 24x24px (with 44px touch area) | Built into Shadcn components |
| Icon Buttons | 44x44px | `h-11 w-11` or `size-11` |

### Example: Touch-Friendly Button

```tsx
<Button
  className="min-h-[44px] px-6"  // Ensures 44px height
  size="default"
>
  Click Me
</Button>

// Icon-only button
<Button
  variant="ghost"
  size="icon"  // Automatically 44x44px in Shadcn
>
  <Settings className="h-5 w-5" />
</Button>
```

---

## Testing Requirements

### Manual Testing Checklist

For EVERY new page or component, verify:

- [ ] **375px (Mobile)**: No horizontal scroll, all text readable, touch targets 44px+
- [ ] **768px (Tablet)**: Proper layout transitions, no awkward spacing
- [ ] **1024px (Laptop)**: Full desktop experience, optimal use of space
- [ ] **Touch Testing**: All interactive elements work with touch (use browser DevTools device mode)
- [ ] **Orientation**: Both portrait and landscape work (especially for tablets)

### Browser DevTools Testing

1. Open Chrome/Edge DevTools (F12)
2. Click "Toggle device toolbar" (Ctrl+Shift+M)
3. Test these presets:
   - iPhone SE (375x667)
   - iPad (768x1024)
   - Laptop (1024x768)
4. Also test with "Responsive" mode and manually resize

### Automated Testing

Include viewport tests for critical flows:

```typescript
// In component tests
import { renderHook } from '@testing-library/react'
import { useViewport } from '@/hooks/useViewport'

it('renders mobile view on small screens', () => {
  // Mock viewport to mobile
  vi.mocked(useViewport).mockReturnValue({
    isMobile: true,
    // ... other properties
  })

  const { getByTestId } = render(<MyComponent />)
  expect(getByTestId('mobile-view')).toBeInTheDocument()
})
```

---

## Component Guidelines

### Layout Components

#### Page Container

```tsx
// Standard page container with responsive padding
<div className="container mx-auto px-4 md:px-6 lg:px-8 py-6">
  {/* Page content */}
</div>
```

#### Two-Column Layout

```tsx
// Stack on mobile, side-by-side on desktop
<div className="flex flex-col md:flex-row gap-6">
  <aside className="w-full md:w-64">Sidebar</aside>
  <main className="flex-1">Main Content</main>
</div>
```

### Common Patterns

#### Show/Hide Based on Viewport

```tsx
// Show only on mobile
<div className="md:hidden">
  Mobile-only content
</div>

// Hide on mobile
<div className="hidden md:block">
  Desktop-only content
</div>

// Complex conditional rendering
const { isMobile } = useViewport()
return (
  <>
    {isMobile ? <MobileNav /> : <DesktopNav />}
  </>
)
```

#### Responsive Spacing

```tsx
// Decrease spacing on mobile
<div className="space-y-2 md:space-y-4 lg:space-y-6">
  {/* Children have responsive vertical spacing */}
</div>

// Responsive padding
<Card className="p-4 md:p-6 lg:p-8">
  {/* Padding scales with viewport */}
</Card>
```

---

## Anti-Patterns (DO NOT USE)

### ❌ Fixed Pixel Widths

```tsx
// BAD: Doesn't adapt to viewport
<div style={{ width: '600px' }}>Content</div>

// GOOD: Responsive width
<div className="w-full max-w-2xl">Content</div>
```

### ❌ Viewport Units Without Constraints

```tsx
// BAD: Can cause horizontal scroll
<div className="w-screen">Content</div>

// GOOD: Constrained to parent
<div className="w-full">Content</div>
```

### ❌ Small Touch Targets

```tsx
// BAD: Too small for touch
<button className="h-8 w-8">
  <X className="h-4 w-4" />
</button>

// GOOD: 44px minimum
<Button size="icon">  // 44x44px
  <X className="h-5 w-5" />
</Button>
```

### ❌ Relying Only on Hover States

```tsx
// BAD: Hover doesn't work on touch devices
<div className="hover:bg-gray-100">
  Hover me
</div>

// GOOD: Use active/focus states too
<div className="hover:bg-gray-100 active:bg-gray-200 focus:bg-gray-100">
  Tap or hover me
</div>
```

---

## Quick Reference

### Common Breakpoint Patterns

| Pattern | Classes |
|---------|---------|
| Mobile: 1 col, Desktop: 2 cols | `grid-cols-1 md:grid-cols-2` |
| Mobile: 1 col, Tablet: 2, Desktop: 3 | `grid-cols-1 md:grid-cols-2 lg:grid-cols-3` |
| Hide on mobile | `hidden md:block` |
| Show only on mobile | `md:hidden` |
| Full width on mobile, fixed on desktop | `w-full md:w-64` |
| Stack vertical on mobile, horizontal on desktop | `flex-col md:flex-row` |

### Touch-Friendly Sizes

| Element | Tailwind Class |
|---------|----------------|
| Button | `min-h-[44px]` |
| Icon Button | `size-11` (44px) |
| Input | `h-11` (44px) |
| Link padding | `py-3` |
| Tab bar height | `h-14` (56px) |

---

## Resources

- [Tailwind Responsive Design](https://tailwindcss.com/docs/responsive-design)
- [WCAG Touch Target Guidelines](https://www.w3.org/WAI/WCAG21/Understanding/target-size.html)
- [Material Design Touch Targets](https://material.io/design/usability/accessibility.html#layout-and-typography)
- [Apple Human Interface Guidelines - Touch Targets](https://developer.apple.com/design/human-interface-guidelines/ios/visual-design/adaptivity-and-layout/)

---

## Questions?

If you're unsure about implementing a responsive pattern:

1. Check this guide first
2. Look for similar patterns in existing components
3. Test at all three critical breakpoints (375px, 768px, 1024px)
4. Get feedback during PR review

**Remember**: Mobile-first design means starting with the smallest viewport and enhancing for larger screens, not the other way around.
