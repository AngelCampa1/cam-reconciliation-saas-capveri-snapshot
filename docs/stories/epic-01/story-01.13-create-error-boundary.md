# Story 1.13: Create Error Boundary

## Story Info
- **Epic**: Design System & UI Foundation
- **Estimated Hours**: 2
- **Dependencies**: Story 1.3 (Shadcn/UI must be installed)
- **Status**: `completed`

## User Story
**As a** user
**I want** the app to gracefully handle errors without crashing entirely
**So that** I can continue working even if one component fails

## Acceptance Criteria

- [x] **AC1**: Error boundary catches React rendering errors
- [x] **AC2**: Friendly error message displayed (not technical stack trace)
- [x] **AC3**: "Try again" button resets the component
- [x] **AC4**: Error details logged to console (dev) or service (prod)
- [x] **AC5**: Different variants for:
  - Full page errors
  - Component-level errors (smaller UI)
- [x] **AC6**: Contact support link/info included

## Technical Specifications

**Files to Create**:
```
frontend/src/components/
└── ErrorBoundary.tsx
```

**ErrorBoundary.tsx**:
```typescript
import { Component, ErrorInfo, ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: Error, errorInfo: ErrorInfo) => void
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo)
    this.props.onError?.(error, errorInfo)
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  public render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <ErrorFallback
          error={this.state.error}
          onReset={this.handleReset}
        />
      )
    }

    return this.props.children
  }
}

function ErrorFallback({ error, onReset }) {
  return (
    <div className="flex flex-col items-center justify-center p-8">
      <AlertCircle className="h-12 w-12 text-error mb-4" />
      <h2 className="text-xl font-semibold mb-2">Something went wrong</h2>
      <p className="text-muted-foreground mb-4">
        We're sorry, but something unexpected happened.
      </p>
      <Button onClick={onReset}>Try again</Button>
    </div>
  )
}
```

## Test Cases

- [x] Errors caught and displayed gracefully
- [x] Reset functionality works
- [x] Errors logged appropriately

## Definition of Done

- [x] All acceptance criteria met
- [x] Tests written and passing
- [x] Code reviewed
- [x] Documentation updated
- [x] Errors caught and displayed gracefully
- [x] Reset functionality works
- [x] Errors logged appropriately

## Completion Notes

**Completed**: 2025-12-28

**Implementation**:
- Created `ErrorBoundary.tsx` with class component (required for error boundaries)
- Implemented 3 variants: `page` (full page), `inline` (component-level), `minimal` (compact)
- Added `ErrorFallback` component for flexible error display
- Added `withErrorBoundary` HOC for easy component wrapping
- Added `useErrorBoundary` hook for programmatic error throwing
- Dev mode shows expandable error details, prod mode shows user-friendly message only
- Custom support email prop with default `angel.campa@capveri.com`
- Proper ARIA attributes for accessibility (role="alert")

**Files Created/Modified**:
- `frontend/src/components/ErrorBoundary.tsx` (new)
- `frontend/src/components/ErrorBoundary.test.tsx` (new, 36 tests)

**Test Results**: 36 new tests, 1079 total tests passing
