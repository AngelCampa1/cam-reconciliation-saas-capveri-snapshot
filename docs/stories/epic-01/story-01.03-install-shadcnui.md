# Story 1.3: Install Shadcn/UI

## Story Info
- **Epic**: Design System & UI Foundation
- **Estimated Hours**: 2
- **Dependencies**: Story 1.2 (Design tokens must be defined)
- **Status**: `completed`

## User Story
**As a** frontend developer
**I want** Shadcn/UI initialized with base components
**So that** I have accessible, well-designed components to build upon

## Acceptance Criteria

- [x] **AC1**: Shadcn configured manually (components.json + dependencies)
- [x] **AC2**: `components.json` configuration file created
- [x] **AC3**: Base components installed:
  - Button
  - Input
  - Label
  - Card
- [x] **AC4**: Components located in `src/components/ui/`
- [x] **AC5**: `cn()` utility function available for class merging
- [x] **AC6**: Components render correctly with design tokens

## Technical Specifications

**Files Created by Shadcn**:
```
frontend/
├── components.json
└── src/
    ├── lib/
    │   └── utils.ts    (cn utility)
    └── components/
        └── ui/
            ├── button.tsx
            ├── input.tsx
            ├── label.tsx
            └── card.tsx
```

**components.json**:
```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "default",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.js",
    "css": "src/globals.css",
    "baseColor": "slate",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils"
  }
}
```

**Dependencies Added by Shadcn**:
```json
{
  "dependencies": {
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.0.0",
    "tailwind-merge": "^2.2.0"
  }
}
```

**Path Alias Setup** (tsconfig.json):
```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

## Test Cases

- [x] `npx shadcn-ui add` command compatible (components.json configured)
- [x] Button component renders with correct styles (18 tests)
- [x] Path aliases resolve correctly (build and tests pass)

## Definition of Done

- [x] All acceptance criteria met
- [x] Tests written and passing (88 new tests: 18 Button, 17 Input, 10 Label, 21 Card, 22 cn utility)
- [x] Code reviewed
- [x] Documentation updated
- [x] `npx shadcn-ui add` compatible (components.json configured)
- [x] Button component renders with correct styles
- [x] Path aliases resolve correctly
