# CapVeri Design Token System

> **Last Updated**: 2026-01-07
> **Status**: Production-Ready ✅

## Overview

The CapVeri design token system provides a comprehensive, semantic foundation for building consistent, accessible, and maintainable user interfaces. All tokens follow the"Audit-Ready Clarity" (light) and"Deep Audit Focus" (dark) design philosophy.

## Philosophy

- **Semantic Naming**: Tokens describe purpose, not appearance (`--spacing-lg` not `--spacing-16px`)
- **Theme-Adaptive**: All tokens support light and Light-Only Modes automatically
- **HSL Format**: Uses HSL color space for easier opacity modifications
- **Financial Precision**: 4px base unit system for data-dense interfaces
- **WCAG AA Compliant**: Minimum 4.5:1 contrast for text, 3:1 for UI elements

---

## Token Categories

### 1. Colors

#### Semantic Colors
Use these for UI states and feedback:

```css
/* Success - Use for: completed states, verified data, positive feedback */
bg-success text-success-foreground

/* Warning - Use for: caution states, opportunities, pending items */
bg-warning text-warning-foreground

/* Error - Use for: errors, deletions, critical alerts */
bg-error text-error-foreground

/* Info - Use for: informational messages, tips */
bg-info text-info-foreground
```

#### Brand Colors
```css
/* Primary - CapVeri Navy (#304476) */
bg-primary text-primary-foreground

/* Primary scale for gradients and depth */
bg-primary-50   /* Lightest */
bg-primary-900  /* Darkest */
```

#### Chart/Data Visualization
```css
/* Chart 1 - Emerald: Recovered Revenue */
hsl(var(--chart-1))

/* Chart 2 - Amber: Revenue Leakage (Opportunity) */
hsl(var(--chart-2))

/* Chart 3 - Navy: Fixed Expenses */
hsl(var(--chart-3))

/* Chart 4 - Purple: Cap Rates/Projections */
hsl(var(--chart-4))

/* Chart 5 - Orange: Critical Alerts */
hsl(var(--chart-5))
```

**Example Usage**:
```tsx
// Recharts requires computed color strings
<Line stroke="hsl(var(--chart-3))" />
<Area fill="hsl(var(--chart-1))" />
```

#### Status/Badge Colors (NEW)
For workflow state visualization:

```css
bg-status-neutral         /* Default/undefined state */
bg-status-pending         /* Awaiting action */
bg-status-in-progress     /* Actively being worked */
bg-status-draft           /* Not finalized */
bg-status-verified        /* Approved/finalized */
bg-status-archived        /* Historical/read-only */
```

**Badge Component Usage**:
```tsx
<Badge variant="pending">Awaiting Review</Badge>
<Badge variant="verified">Approved</Badge>
<Badge variant="archived">2023 Reconciliation</Badge>
```

#### Surface System
Subtle background variations for depth:

```css
bg-surface-base      /* Default background */
bg-surface-raised    /* Cards, elevated elements */
bg-surface-sunken    /* Input fields, recessed areas */
bg-surface-hover     /* Hover states */
bg-surface-active    /* Active/pressed states */
bg-surface-selected  /* Selected rows, active nav */
```

---

### 2. Spacing

#### Spacing Scale (4px base unit)
```css
p-xs    /* 4px  - Micro spacing */
p-sm    /* 8px  - Compact spacing */
p-md    /* 12px - Default gap */
p-lg    /* 16px - Standard spacing */
p-xl    /* 24px - Large spacing */
p-2xl   /* 32px - XL spacing */
p-3xl   /* 48px - Hero spacing */
p-4xl   /* 64px - Giant spacing */
```

**When to Use**:
- `xs/sm`: Icon padding, tight gaps in compact UIs
- `md`: Form field gaps, list item spacing
- `lg`: Card padding, button padding
- `xl`: Section gaps, card inner padding
- `2xl+`: Page sections, hero areas

**Migration Example**:
```tsx
// Before: Arbitrary Tailwind defaults
<Card className="p-4 gap-6">

// After: Semantic tokens
<Card className="p-lg gap-xl">
```

---

### 3. Z-Index Layering

Semantic z-index prevents stacking conflicts:

```css
z-base      /* 0  - Default layer */
z-sticky    /* 10 - Sticky table headers, nav bars */
z-fixed     /* 20 - Fixed position elements */
z-overlay   /* 30 - Modal backdrops */
z-dropdown  /* 40 - Dropdowns, selects, popovers */
z-modal     /* 50 - Dialogs, sheets, alerts */
z-toast     /* 60 - Toast notifications */
z-tooltip   /* 70 - Tooltips (highest layer) */
```

**Component Mappings**:
```tsx
<Dialog>        → z-modal
<Sheet>         → z-modal
<DropdownMenu>  → z-dropdown
<Select>        → z-dropdown
<Tooltip>       → z-tooltip
<Toaster>       → z-toast (automatic)
<TableHeader>   → z-sticky (when sticky)
```

---

### 4. Typography

#### Font Sizes
```css
text-xs     /* 12px - Small labels */
text-sm     /* 14px - Body text (compact) */
text-base   /* 16px - Body text (default) */
text-lg     /* 18px - Subheadings */
text-xl     /* 20px - Headings */
text-2xl    /* 24px - Page titles */
text-3xl    /* 30px - Hero text */
text-4xl    /* 36px - Landing page */
```

#### Line Heights
```css
leading-tight    /* 1.25 - Headings */
leading-snug     /* 1.375 - Subheadings */
leading-normal   /* 1.5 - Body text */
leading-relaxed  /* 1.625 - Long-form content */
```

#### Font Weights
```css
font-normal      /* 400 - Body text */
font-medium      /* 500 - Emphasis */
font-semibold    /* 600 - Headings */
font-bold        /* 700 - Strong emphasis */
```

---

### 5. Icons

Standardized icon sizing aligned with typography:

```css
w-icon-xs h-icon-xs      /* 12px - Small inline icons */
w-icon-sm h-icon-sm      /* 14px - Compact UI icons */
w-icon h-icon            /* 16px - Default icon size */
w-icon-lg h-icon-lg      /* 20px - Medium emphasis */
w-icon-xl h-icon-xl      /* 24px - Large action icons */
w-icon-2xl h-icon-2xl    /* 32px - Hero/feature icons */
```

**Usage**:
```tsx
// Before
<Button className="[&_svg]:size-4">

// After
<Button className="[&_svg]:w-icon [&_svg]:h-icon">
<EmptyState icon={<Icon className="w-icon-2xl h-icon-2xl" />} />
```

---

### 6. Shadows & Elevation

#### Elevation System
```css
shadow-elevation-0  /* No shadow (flat) */
shadow-elevation-1  /* Subtle (cards, headers) */
shadow-elevation-2  /* Medium (modals, sticky elements) */
shadow-elevation-3  /* Prominent (drawers, popovers) */
shadow-elevation-4  /* Maximum (toasts, tooltips) */
```

#### Colored Shadows
```css
shadow-primary-sm   /* Primary-colored subtle shadow */
shadow-primary-md   /* Primary-colored medium shadow */
```

#### Focus Rings
```css
shadow-ring-soft     /* Default focus ring */
shadow-ring-error    /* Error state focus */
shadow-ring-success  /* Success state focus */
```

---

### 7. Data Tables (NEW)

Granular control for financial data grids:

```css
/* CSS Variables (use with bg-[var(...)] syntax) */
--table-border
--table-header-bg
--table-header-text
--table-row-bg-hover
--table-row-bg-selected
--table-row-border-selected
--table-row-bg-odd        /* Zebra striping */
--table-footer-bg
```

**Table Component Migration**:
```tsx
// Before
<TableHeader className="bg-muted/30">

// After
<TableHeader className="bg-[var(--table-header-bg)]">

// Before
<TableRow className="hover:bg-muted/30">

// After
<TableRow className="hover:bg-[var(--table-row-bg-hover)]">
```

---

### 8. Form Input States (NEW)

Enhanced form interaction tokens:

```css
/* CSS Variables */
--input-border-hover
--input-border-disabled
--input-bg-disabled
--input-text-disabled
--input-border-error
--input-ring-error
--input-border-success
--input-ring-success
--input-border-readonly
--input-bg-readonly
```

**Future Input Component Enhancements**:
```tsx
<Input error className="border-[var(--input-border-error)]" />
<Input success className="border-[var(--input-border-success)]" />
<Input readOnly className="bg-[var(--input-bg-readonly)]" />
```

---

### 9. Container Widths

Semantic max-width constraints:

```css
max-w-container-xs    /* 320px - Narrow dialogs */
max-w-container-sm    /* 448px - Compact forms */
max-w-container-md    /* 512px - Standard forms */
max-w-container-lg    /* 672px - Content pages */
max-w-container-xl    /* 896px - Settings pages */
max-w-container-2xl   /* 1152px - Dashboard */
max-w-prose           /* 65ch - Optimal reading width */
```

**When to Use**:
```tsx
<Dialog size="sm">              → max-w-container-sm
<Settings>                      → max-w-container-xl
<HelpDocumentation>             → max-w-prose
<DashboardContent>              → max-w-container-2xl
```

---

### 10. Animations & Transitions

#### Durations
```css
duration-instant  /* 50ms - Instant feedback */
duration-fast     /* 100ms - Button transitions */
duration-normal   /* 150ms - Page transitions */
duration-slow     /* 250ms - Complex animations */
duration-slower   /* 350ms - Large transitions */
```

#### Easing Functions
```css
ease-out-expo     /* Primary easing (smooth deceleration) */
ease-in-out-expo  /* Modal animations */
ease-spring       /* Playful interactions */
```

**Usage**:
```tsx
<Button className="transition-all duration-fast ease-out-expo">
```

---

## Light-Only Mode

All tokens automatically adapt to Light-Only Mode via the `.light` class. No manual Light-Only Mode variants needed:

```tsx
// ✓ Correct - Automatic Light-Only Mode
<div className="bg-success/10 text-success">

// ✗ Wrong - Manual Light-Only Mode (not needed!)
<div className="bg-success/10 text-success">
```

### Light-Only Mode Adjustments

The following tokens have custom Light-Only Mode values for better visibility:

- Status colors (slightly brighter)
- Table backgrounds (more subtle)
- Input disabled states (less opaque)
- Prose code backgrounds (transparent)

---

## Common Patterns

### Card Layout
```tsx
<Card className="p-lg gap-md">
  <CardHeader className="pb-md">
    <CardTitle className="text-xl font-semibold">
  </CardHeader>
  <CardContent className="space-y-lg">
```

### Form Layout
```tsx
<form className="space-y-lg max-w-container-md">
  <div className="space-y-md">
    <Label />
    <Input />
  </div>
</form>
```

### Data Grid
```tsx
<Table>
  <TableHeader className="sticky top-0 z-sticky bg-[var(--table-header-bg)]">
    <TableRow>
      <TableHead className="text-[var(--table-header-text)]">
  </TableHeader>
  <TableBody>
    <TableRow className="hover:bg-[var(--table-row-bg-hover)]">
```

### Modal/Dialog
```tsx
<Dialog>
  <DialogOverlay className="z-overlay" />
  <DialogContent className="z-modal max-w-container-md" />
</Dialog>
```

---

## Migration Guide

### Step 1: Replace Hardcoded Colors

```tsx
// Before
stroke="#2563eb"
className="bg-green-50"

// After
stroke="hsl(var(--chart-3))"
className="bg-success/10"
```

### Step 2: Replace Hardcoded Spacing

```tsx
// Before
className="p-4 gap-6 space-y-3"

// After
className="p-lg gap-xl space-y-md"
```

### Step 3: Replace Hardcoded Z-Index

```tsx
// Before
className="z-50"
className="z-40"

// After
className="z-modal"
className="z-dropdown"
```

### Step 4: Use Table Tokens

```tsx
// Before
<TableHeader className="bg-muted/30">

// After
<TableHeader className="bg-[var(--table-header-bg)]">
```

---

## Best Practices

### DO ✓

- Use semantic tokens for all colors, spacing, and layering
- Use HSL format with opacity for color variations: `bg-primary/10`
- Use semantic z-index tokens to prevent stacking conflicts
- Use spacing tokens for consistent rhythm
- Test in both light and Light-Only Modes

### DON'T ✗

- Hardcode hex colors: `#2563eb`
- Use Tailwind default colors for UI states: `bg-green-50`
- Use arbitrary z-index values: `z-[999]`
- Use pixel values for spacing: `p-[16px]`
- Add manual Light-Only Mode variants: `bg-success-dark`
- Use inline shadow values: `shadow-[0_1px_3px...]`

---

## Token Reference

### Complete Token List

**File**: `frontend/src/index.css`

```css
/* Spacing */
--spacing-1 through --spacing-20

/* Z-Index */
--z-base, --z-sticky, --z-fixed, --z-overlay, --z-dropdown, --z-modal, --z-toast, --z-tooltip

/* Icons */
--icon-xs, --icon-sm, --icon-base, --icon-lg, --icon-xl, --icon-2xl

/* Form States */
--input-border-hover, --input-border-disabled, --input-bg-disabled, --input-text-disabled
--input-border-error, --input-ring-error, --input-border-success, --input-ring-success
--input-border-readonly, --input-bg-readonly

/* Data Tables */
--table-border, --table-header-bg, --table-header-text, --table-row-bg-hover
--table-row-bg-selected, --table-row-border-selected, --table-row-bg-odd
--table-footer-bg, --table-footer-border

/* Status Colors */
--status-neutral, --status-pending, --status-in-progress
--status-draft, --status-verified, --status-archived

/* Containers */
--container-xs through --container-2xl, --prose-width

/* Breakpoints */
--breakpoint-sm, --breakpoint-md, --breakpoint-lg, --breakpoint-xl, --breakpoint-2xl

/* Prose */
--prose-body, --prose-headings, --prose-links, --prose-code, --prose-code-bg
--prose-p-margin, --prose-h2-margin
```

**File**: `frontend/tailwind.config.js`

All tokens are mapped to Tailwind utilities for easy usage.

---

## Support

For questions or issues:
- Check `frontend/src/index.css` for all token definitions
- Review `frontend/tailwind.config.js` for Tailwind mappings
- See component examples in `frontend/src/components/ui/`

---

**Design Philosophy**:"Audit-Ready Clarity" (light) meets"Deep Audit Focus" (dark)
