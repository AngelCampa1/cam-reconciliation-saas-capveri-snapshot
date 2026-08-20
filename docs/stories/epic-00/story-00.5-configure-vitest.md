# Story 0.5: Configure Vitest

## Story Info
- **Epic**: Developer Foundation & Tooling
- **Estimated Hours**: 2
- **Dependencies**: Story 0.4
- **Status**: `pending`

## User Story
**As a** frontend developer
**I want** Vitest configured with React Testing Library and coverage
**So that** I can write and run component tests with the same coverage standards as backend

## Acceptance Criteria
- [ ] **AC1**: Vitest `>=4.0.0` installed and configured
- [ ] **AC2**: React Testing Library installed (`@testing-library/react`, `@testing-library/jest-dom`)
- [ ] **AC3**: `npm test` runs all tests in `src/`
- [ ] **AC4**: `npm run test:coverage` generates coverage report
- [ ] **AC5**: Coverage threshold set to 95% (matching backend)
- [ ] **AC6**: Sample component test exists and passes
- [ ] **AC7**: jsdom environment configured for DOM testing
- [ ] **AC8**: @testing-library/dom `>=10.0.0` installed as peer dependency

## Technical Specifications
**Files to Create/Modify**:
```
frontend/
├── package.json        (add test scripts)
├── vite.config.ts      (add test config)
├── src/
│   └── App.test.tsx    (sample test)
└── src/
    └── setupTests.ts   (test setup file)
```

**vite.config.ts** (with test config):
```typescript
/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.ts',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: ['node_modules/', 'src/setupTests.ts'],
      thresholds: {
        statements: 95,
        branches: 95,
        functions: 95,
        lines: 95
      }
    }
  }
})
```

**Dev Dependencies to Add**:
```json
{
  "devDependencies": {
    "vitest": "^4.0.0",
    "@vitest/coverage-v8": "^4.0.0",
    "@testing-library/react": "^16.0.0",
    "@testing-library/dom": "^10.0.0",
    "@testing-library/jest-dom": "^6.6.0",
    "jsdom": "^25.0.0"
  }
}
```

**Sample Test** (`src/App.test.tsx`):
```typescript
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import App from './App'

describe('App', () => {
  it('renders CapVeri heading', () => {
    render(<App />)
    expect(screen.getByText(/CapVeri/i)).toBeInTheDocument()
  })
})
```

## Definition of Done
- [ ] `npm test` runs and passes
- [ ] Coverage report generated
- [ ] Coverage threshold enforced
- [ ] React component can be tested with Testing Library
