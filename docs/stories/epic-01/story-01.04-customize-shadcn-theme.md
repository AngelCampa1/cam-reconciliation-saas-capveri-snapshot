# Story 1.4: Customize Shadcn Theme

## Story Info
- **Epic**: Design System & UI Foundation
- **Estimated Hours**: 3
- **Dependencies**: Story 1.3 (Shadcn/UI must be installed)
- **Status**: `completed`

## User Story
**As a** product owner
**I want** Shadcn components styled with CapVeri brand identity
**So that** the app looks professional and cohesive, not like a generic template

## Acceptance Criteria

- [x] **AC1**: Primary color reflects CapVeri brand (professional blue)
- [x] **AC2**: Border radius is slightly rounded (not too sharp, not too round)
- [x] **AC3**: Button styles have appropriate hover/focus states
- [x] **AC4**: Form inputs have clear focus indicators
- [x] **AC5**: Cards have subtle shadows for depth
- [x] **AC6**: All interactive elements have visible focus states (accessibility)
- [x] **AC7**: Font stack uses system fonts for performance

## Technical Specifications

**Files to Modify**:
```
frontend/src/
├── globals.css         (fine-tune token values)
└── components/ui/
    └── button.tsx      (adjust variants if needed)
```

**Brand Customizations**:
```css
@layer base {
  :root {
    /* CapVeri Brand Blue - Professional, Trustworthy */
    --primary: 217 91% 40%;  /* #1a56db */
    --primary-foreground: 0 0% 100%;

    /* Slightly larger radius for friendly feel */
    --radius: 0.625rem;

    /* Refined shadows */
    --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
    --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1);
    --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1);
  }

  /* Focus ring style */
  *:focus-visible {
    outline: 2px solid hsl(var(--ring));
    outline-offset: 2px;
  }

  /* System font stack */
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
      'Helvetica Neue', Arial, sans-serif;
  }
}
```

## Test Cases

- [x] Visual review confirms brand alignment
- [x] All components pass color contrast checks (WCAG AA)
- [x] Focus states visible on all interactive elements

## Definition of Done

- [x] All acceptance criteria met
- [x] Tests written and passing (11 new tests for Story 1.4)
- [x] Code reviewed
- [x] Documentation updated
- [x] Visual review confirms brand alignment
- [x] All components pass color contrast checks (WCAG AA)
- [x] Focus states visible on all interactive elements
