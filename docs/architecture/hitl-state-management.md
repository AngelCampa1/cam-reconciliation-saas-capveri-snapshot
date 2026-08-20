# Human-in-the-Loop (HITL) State Management Architecture

## Overview

This document defines the state management patterns for the HITL Verification UI (Epic 16), which allows users to review and approve AI-extracted lease data alongside the source PDF.

## Core Architecture

### State Management Pattern: React Context + Reducer

We use React Context with `useReducer` for predictable state updates and undo capability.

```typescript
// frontend/src/features/verification/context/HITLContext.tsx

interface HITLState {
  // Document state
  documentId: string;
  currentPage: number;
  totalPages: number;

  // Extracted data
  originalProfile: LeaseRecoveryProfile;
  editedProfile: LeaseRecoveryProfile;

  // Edit tracking
  editHistory: EditAction[];
  historyIndex: number;  // Current position in history (for undo/redo)

  // UI state
  activeField: string | null;
  highlightedBbox: BoundingBox | null;
  validationErrors: ValidationError[];
  validationWarnings: ValidationWarning[];

  // Workflow state
  status: 'reviewing' | 'approved' | 'rejected';
  isDirty: boolean;
}

type HITLAction =
  | { type: 'SET_FIELD'; field: string; value: unknown; source?: string }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'RESET_TO_ORIGINAL' }
  | { type: 'SET_ACTIVE_FIELD'; field: string | null }
  | { type: 'NAVIGATE_TO_PAGE'; page: number }
  | { type: 'HIGHLIGHT_BBOX'; bbox: BoundingBox | null }
  | { type: 'SET_VALIDATION'; errors: ValidationError[]; warnings: ValidationWarning[] }
  | { type: 'APPROVE' }
  | { type: 'REJECT'; reason: string };

function hitlReducer(state: HITLState, action: HITLAction): HITLState {
  switch (action.type) {
    case 'SET_FIELD': {
      const newProfile = { ...state.editedProfile, [action.field]: action.value };
      const editAction: EditAction = {
        field: action.field,
        oldValue: state.editedProfile[action.field],
        newValue: action.value,
        timestamp: new Date().toISOString(),
      };

      // Trim future history if we're not at the end
      const newHistory = state.editHistory.slice(0, state.historyIndex + 1);
      newHistory.push(editAction);

      return {
        ...state,
        editedProfile: newProfile,
        editHistory: newHistory,
        historyIndex: newHistory.length - 1,
        isDirty: true,
      };
    }

    case 'UNDO': {
      if (state.historyIndex < 0) return state;

      const editToUndo = state.editHistory[state.historyIndex];
      const newProfile = {
        ...state.editedProfile,
        [editToUndo.field]: editToUndo.oldValue,
      };

      return {
        ...state,
        editedProfile: newProfile,
        historyIndex: state.historyIndex - 1,
      };
    }

    case 'REDO': {
      if (state.historyIndex >= state.editHistory.length - 1) return state;

      const editToRedo = state.editHistory[state.historyIndex + 1];
      const newProfile = {
        ...state.editedProfile,
        [editToRedo.field]: editToRedo.newValue,
      };

      return {
        ...state,
        editedProfile: newProfile,
        historyIndex: state.historyIndex + 1,
      };
    }

    case 'RESET_TO_ORIGINAL':
      return {
        ...state,
        editedProfile: { ...state.originalProfile },
        editHistory: [],
        historyIndex: -1,
        isDirty: false,
      };

    // ... other cases
  }
}
```

## PDF Navigation Integration

### react-pdf Integration

```typescript
// frontend/src/features/verification/hooks/usePdfNavigation.ts

import { useCallback, useRef } from 'react';
import { Document, Page } from 'react-pdf';

export function usePdfNavigation() {
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  const scrollToPage = useCallback((pageNumber: number) => {
    const pageElement = pageRefs.current.get(pageNumber);
    if (pageElement) {
      pageElement.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }
  }, []);

  const scrollToBbox = useCallback((bbox: BoundingBox, pageNumber: number) => {
    const pageElement = pageRefs.current.get(pageNumber);
    if (!pageElement) return;

    // First scroll to page
    pageElement.scrollIntoView({ behavior: 'smooth', block: 'start' });

    // Then scroll within page to bbox position (after page scroll completes)
    setTimeout(() => {
      const pageRect = pageElement.getBoundingClientRect();
      const targetY = pageRect.top + (bbox.top * pageRect.height);

      window.scrollBy({
        top: targetY - window.innerHeight / 3,  // Position bbox in upper third
        behavior: 'smooth',
      });
    }, 300);
  }, []);

  const registerPageRef = useCallback((pageNumber: number, element: HTMLDivElement | null) => {
    if (element) {
      pageRefs.current.set(pageNumber, element);
    } else {
      pageRefs.current.delete(pageNumber);
    }
  }, []);

  return { scrollToPage, scrollToBbox, registerPageRef };
}
```

## Field-to-PDF Bidirectional Linking

### Source Reference Structure

Each extracted field includes source references from the LLM extraction:

```typescript
interface FieldSourceReference {
  field: string;
  pageNumber: number;
  bbox: BoundingBox;  // Normalized 0-1 coordinates
  sourceText: string;
  confidence: number;
}

interface BoundingBox {
  left: number;   // 0-1
  top: number;    // 0-1
  width: number;  // 0-1
  height: number; // 0-1
}
```

### Click-to-Navigate Pattern

```typescript
// When user clicks a field in the edit form
const handleFieldFocus = (fieldName: string) => {
  dispatch({ type: 'SET_ACTIVE_FIELD', field: fieldName });

  const sourceRef = sourceReferences.find(ref => ref.field === fieldName);
  if (sourceRef) {
    scrollToBbox(sourceRef.bbox, sourceRef.pageNumber);
    dispatch({ type: 'HIGHLIGHT_BBOX', bbox: sourceRef.bbox });
  }
};

// When user clicks a highlighted bbox in the PDF
const handleBboxClick = (sourceRef: FieldSourceReference) => {
  dispatch({ type: 'SET_ACTIVE_FIELD', field: sourceRef.field });
  // Scroll form to show the field (in the left panel)
  document.getElementById(`field-${sourceRef.field}`)?.scrollIntoView({
    behavior: 'smooth',
    block: 'center',
  });
};
```

## Edit Interface Component Structure

```typescript
// frontend/src/features/verification/components/EditInterface.tsx

interface EditInterfaceProps {
  profile: LeaseRecoveryProfile;
  originalProfile: LeaseRecoveryProfile;
  sourceReferences: FieldSourceReference[];
  onFieldChange: (field: string, value: unknown) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

function EditInterface({
  profile,
  originalProfile,
  sourceReferences,
  onFieldChange,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}: EditInterfaceProps) {
  return (
    <div className="edit-interface">
      <div className="edit-header">
        <h2>Extracted Lease Terms</h2>
        <div className="edit-actions">
          <Button onClick={onUndo} disabled={!canUndo}>
            <Undo2 className="h-4 w-4" /> Undo
          </Button>
          <Button onClick={onRedo} disabled={!canRedo}>
            <Redo2 className="h-4 w-4" /> Redo
          </Button>
        </div>
      </div>

      {Object.entries(FIELD_DEFINITIONS).map(([field, def]) => (
        <EditableField
          key={field}
          field={field}
          label={def.label}
          type={def.type}
          value={profile[field]}
          originalValue={originalProfile[field]}
          isChanged={profile[field] !== originalProfile[field]}
          sourceRef={sourceReferences.find(r => r.field === field)}
          onChange={(value) => onFieldChange(field, value)}
        />
      ))}
    </div>
  );
}
```

## Approval Workflow State Machine

```
                          ┌──────────┐
                          │ LOADING  │
                          └────┬─────┘
                               │
                               ▼
    ┌────────────────────────────────────────────┐
    │                  REVIEWING                  │
    │  (user can edit fields, undo/redo)         │
    └────────┬───────────────────────┬───────────┘
             │                       │
             │ [Approve]             │ [Reject]
             ▼                       ▼
    ┌────────────────┐      ┌────────────────┐
    │   CONFIRMING   │      │   REJECTING    │
    │ (show summary) │      │ (enter reason) │
    └────────┬───────┘      └────────┬───────┘
             │                       │
             │ [Confirm]             │ [Confirm]
             ▼                       ▼
    ┌────────────────┐      ┌────────────────┐
    │    APPROVED    │      │    REJECTED    │
    │ (commit to DB) │      │ (log + requeue)│
    └────────────────┘      └────────────────┘
```

## API Endpoints

### Commit Approved Extraction
```
POST /api/v1/extractions/{document_id}/approve
Body: { profile: LeaseRecoveryProfile, editHistory: EditAction[] }
Response: { success: true, lease_id: UUID }
```

### Reject Extraction
```
POST /api/v1/extractions/{document_id}/reject
Body: { reason: string, requeue: boolean }
Response: { success: true }
```

### Get Extraction for Review
```
GET /api/v1/extractions/{document_id}/review
Response: {
  profile: LeaseRecoveryProfile,
  sourceReferences: FieldSourceReference[],
  confidence: OverallConfidence,
  documentUrl: string,
}
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Z` | Undo |
| `Ctrl+Y` / `Ctrl+Shift+Z` | Redo |
| `Tab` | Next field |
| `Shift+Tab` | Previous field |
| `Ctrl+Enter` | Open approve dialog |
| `Escape` | Close dialogs |

## File Structure

```
frontend/src/features/verification/
├── context/
│   └── HITLContext.tsx          # State management
├── hooks/
│   ├── useHITL.ts               # Main hook
│   ├── usePdfNavigation.ts      # PDF scroll/highlight
│   └── useKeyboardShortcuts.ts  # Keyboard handling
├── components/
│   ├── VerificationPage.tsx     # Main page
│   ├── SplitView.tsx            # Resizable split layout
│   ├── PdfViewer.tsx            # PDF with bbox overlays
│   ├── BoundingBoxOverlay.tsx   # Clickable highlights
│   ├── EditInterface.tsx        # Form fields
│   ├── EditableField.tsx        # Single field with comparison
│   ├── ConfidenceIndicator.tsx  # Confidence badges
│   ├── ApprovalDialog.tsx       # Confirmation modal
│   └── RejectDialog.tsx         # Reject with reason
└── types/
    └── index.ts                 # TypeScript interfaces
```
