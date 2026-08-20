# Story 1.2: Define Design Tokens

## Story Info
- **Epic**: Design System & UI Foundation
- **Estimated Hours**: 3
- **Dependencies**: Story 1.1 (Tailwind must be configured)
- **Status**: `completed`

## User Story
**As a** designer/developer
**I want** a centralized set of design tokens (colors, spacing, typography)
**So that** the app has consistent visual language and theme changes are easy

## Acceptance Criteria

- [x] **AC1**: CSS custom properties defined in `index.css` for:
  - Primary colors (brand blue)
  - Secondary colors (supporting palette)
  - Semantic colors (success, warning, error, info)
  - Neutral colors (gray scale)
  - Background and foreground colors
- [x] **AC2**: Tailwind config extended with custom colors referencing CSS variables
- [x] **AC3**: Typography scale defined (font sizes, weights, line heights)
- [x] **AC4**: Spacing scale uses Tailwind defaults (consistent 4px grid)
- [x] **AC5**: Border radius tokens defined (sm, md, lg)
- [x] **AC6**: Shadow tokens defined (sm, md, lg)
- [x] **AC7**: Light-Only Mode tokens prepared (CSS variables structured for theme switching)

## Technical Specifications

**Files to Modify**:
```
frontend/
├── tailwind.config.js  (extend theme)
└── src/
    └── globals.css     (CSS custom properties)
```

**globals.css** (token definitions):
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    /* Primary - Brand Blue */
    --primary: 221 83% 53%;
    --primary-foreground: 210 40% 98%;

    /* Secondary */
    --secondary: 210 40% 96%;
    --secondary-foreground: 222 47% 11%;

    /* Semantic Colors */
    --success: 142 76% 36%;
    --success-foreground: 355 100% 100%;
    --warning: 38 92% 50%;
    --warning-foreground: 48 96% 89%;
    --error: 0 84% 60%;
    --error-foreground: 0 0% 100%;

    /* Neutrals */
    --background: 0 0% 100%;
    --foreground: 222 47% 11%;
    --muted: 210 40% 96%;
    --muted-foreground: 215 16% 47%;
    --accent: 210 40% 96%;
    --accent-foreground: 222 47% 11%;

    /* UI Elements */
    --card: 0 0% 100%;
    --card-foreground: 222 47% 11%;
    --popover: 0 0% 100%;
    --popover-foreground: 222 47% 11%;
    --border: 214 32% 91%;
    --input: 214 32% 91%;
    --ring: 221 83% 53%;

    /* Border Radius */
    --radius: 0.5rem;
  }

  .light {
    --background: 222 47% 11%;
    --foreground: 210 40% 98%;
    /* ... Light-Only Mode overrides */
  }
}
```

**tailwind.config.js** (extended):
```javascript
/** @type {import('tailwindcss').Config} */
export default {
  lightOnlyMode: ['class'],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        success: {
          DEFAULT: 'hsl(var(--success))',
          foreground: 'hsl(var(--success-foreground))',
        },
        warning: {
          DEFAULT: 'hsl(var(--warning))',
          foreground: 'hsl(var(--warning-foreground))',
        },
        error: {
          DEFAULT: 'hsl(var(--error))',
          foreground: 'hsl(var(--error-foreground))',
        },
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [],
}
```

## Test Cases

- [x] All colors accessible via `bg-primary`, `text-error`, etc.
- [x] No hardcoded color values in any component
- [x] Light-Only Mode tokens prepared (even if not implemented yet)

## Definition of Done

- [x] All acceptance criteria met
- [x] Tests written and passing (18 tests in design-tokens.test.tsx)
- [x] Code reviewed
- [x] Documentation updated
- [x] All colors accessible via `bg-primary`, `text-error`, etc.
- [x] No hardcoded color values in any component
- [x] Light-Only Mode tokens prepared (even if not implemented yet)
