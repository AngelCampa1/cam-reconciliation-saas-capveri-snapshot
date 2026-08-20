# Story 16.6: Create Edit Interface

## Story Info
- **Epic**: Human-in-the-Loop Verification UI
- **Estimated Hours**: 3
- **Dependencies**: Story 16.5
- **Status**: `completed`
- **Completed**: 2025-12-30

## User Story
Inline editing interface for correcting extracted values with change tracking.

## Acceptance Criteria
- [x] All fields editable inline
- [x] Original value shown for comparison
- [x] Changed fields highlighted
- [x] Undo changes per field
- [x] Validation on edit
- [x] Auto-save draft to prevent data loss

## Technical Specifications

Inline editing with change tracking, comparison to original values, and automatic draft saving.

**Reference**: See `docs/architecture/hitl-state-management.md` for full state management patterns.

```typescript
// frontend/src/features/verification/components/EditableField.tsx
import { useState, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { RotateCcw, Eye } from 'lucide-react';

interface EditableFieldProps {
  field: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'select' | 'currency';
  value: unknown;
  originalValue: unknown;
  isChanged: boolean;
  sourceRef?: FieldSourceReference;
  onChange: (value: unknown) => void;
  onFocus?: () => void;
}

export function EditableField({
  field,
  label,
  type,
  value,
  originalValue,
  isChanged,
  sourceRef,
  onChange,
  onFocus,
}: EditableFieldProps) {
  const handleReset = () => onChange(originalValue);

  return (
    <div
      id={`field-${field}`}
      className={cn(
        'p-3 rounded-lg border transition-colors',
        isChanged && 'bg-amber-50 border-amber-200',
      )}
    >
      <div className="flex items-center justify-between mb-1">
        <label className="text-sm font-medium">{label}</label>
        <div className="flex items-center gap-2">
          {sourceRef && (
            <ConfidenceIndicator
              confidence={sourceRef.confidence}
              sourceText={sourceRef.sourceText}
            />
          )}
          {sourceRef && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onFocus}
              title="View source in PDF"
            >
              <Eye className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <FieldInput
          type={type}
          value={value}
          onChange={onChange}
          onFocus={onFocus}
          className="flex-1"
        />
        {isChanged && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReset}
            title="Reset to original"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
        )}
      </div>

      {isChanged && (
        <div className="mt-1 text-xs text-muted-foreground">
          Original: <span className="line-through">{String(originalValue)}</span>
        </div>
      )}
    </div>
  );
}

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
  onFieldFocus: (field: string) => void;
}

const FIELD_DEFINITIONS: Record<string, { label: string; type: FieldType }> = {
  base_year: { label: 'Base Year', type: 'number' },
  pro_rata_share: { label: 'Pro-Rata Share (%)', type: 'currency' },
  admin_fee_percent: { label: 'Admin Fee (%)', type: 'currency' },
  gross_up_target: { label: 'Gross-Up Target (%)', type: 'currency' },
  cap_type: { label: 'Cap Type', type: 'select' },
  cap_rate: { label: 'Cap Rate (%)', type: 'currency' },
};

export function EditInterface({
  profile,
  originalProfile,
  sourceReferences,
  onFieldChange,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onFieldFocus,
}: EditInterfaceProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-4 border-b">
        <h2 className="text-lg font-semibold">Extracted Lease Terms</h2>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onUndo} disabled={!canUndo}>
            <Undo2 className="h-4 w-4 mr-1" /> Undo
          </Button>
          <Button variant="outline" size="sm" onClick={onRedo} disabled={!canRedo}>
            <Redo2 className="h-4 w-4 mr-1" /> Redo
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-3">
        {Object.entries(FIELD_DEFINITIONS).map(([field, def]) => (
          <EditableField
            key={field}
            field={field}
            label={def.label}
            type={def.type}
            value={profile[field as keyof LeaseRecoveryProfile]}
            originalValue={originalProfile[field as keyof LeaseRecoveryProfile]}
            isChanged={profile[field] !== originalProfile[field]}
            sourceRef={sourceReferences.find(r => r.field === field)}
            onChange={(value) => onFieldChange(field, value)}
            onFocus={() => onFieldFocus(field)}
          />
        ))}
      </div>
    </div>
  );
}

// Auto-save hook for draft persistence
// frontend/src/features/verification/hooks/useAutoSave.ts
export function useAutoSave(
  documentId: string,
  editedProfile: LeaseRecoveryProfile,
  isDirty: boolean,
) {
  const debouncedSave = useDebouncedCallback(
    async (profile: LeaseRecoveryProfile) => {
      await fetch(`/api/v1/extractions/${documentId}/draft`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile }),
      });
    },
    2000, // Save after 2 seconds of inactivity
  );

  useEffect(() => {
    if (isDirty) {
      debouncedSave(editedProfile);
    }
  }, [editedProfile, isDirty, debouncedSave]);
}
```

## Test Cases

Test edit interface functionality including:
- All field types render correctly (text, number, date, select, currency)
- Changed fields show amber highlight
- Original value displayed when field is modified
- Reset button reverts to original value
- Undo/Redo buttons work correctly
- Auto-save triggers after 2 seconds of inactivity
- Field focus triggers PDF navigation

## Definition of Done
- [x] All fields editable inline
- [x] Original values shown for comparison
- [x] Changed fields highlighted
- [x] Undo works per field
- [x] Auto-save prevents data loss
- [x] Unit tests passing with 95%+ coverage

## Implementation Notes
- Created `EditableField` component at `frontend/src/features/verification/components/EditableField.tsx` (127 lines)
- Created `EditInterface` component at `frontend/src/features/verification/components/EditInterface.tsx` (103 lines)
- Created `useAutoSave` hook at `frontend/src/features/verification/hooks/useAutoSave.ts` (104 lines)
- Implemented 53 comprehensive tests (19 + 20 + 14):
  - EditableField tests (19 tests):
    - Basic rendering (3 tests)
    - Change highlighting (2 tests)
    - Original value display (2 tests)
    - Reset functionality (3 tests)
    - Input change handling (2 tests)
    - Source reference integration (6 tests)
    - Custom styling (1 test)
  - EditInterface tests (20 tests):
    - Rendering (4 tests)
    - Undo/Redo functionality (6 tests)
    - Field change handling (2 tests)
    - Change highlighting (4 tests)
    - Source reference integration (2 tests)
    - Edge cases (2 tests)
  - useAutoSave tests (14 tests):
    - Auto-save behavior (7 tests)
    - Manual save (3 tests)
    - Error handling (2 tests)
    - Document ID (2 tests)
- EditableField features:
  - Inline text input with controlled value
  - Amber highlighting when value differs from original
  - Original value shown with strikethrough
  - Reset button with RotateCcw icon
  - ConfidenceIndicator integration for source confidence
  - View Source button with Eye icon for PDF navigation
  - Empty string to null conversion
  - Handles null, string, and number values
- EditInterface features:
  - Header with Undo/Redo buttons
  - Scrollable fields container
  - All 7 lease recovery profile fields (base_year, base_year_amount, gross_up_base_year, pro_rata_share, cap_type, cap_rate, admin_fee_percentage)
  - Change detection per field
  - Source reference matching per field
  - Field focus delegation for PDF navigation
- useAutoSave features:
  - Debounced save with 2 second delay (configurable)
  - Only saves when isDirty is true
  - Cancels pending saves on unmount
  - Manual save function for immediate save
  - Can be disabled via options
  - Error logging for failed saves
  - Uses document ID in API endpoint
- All 53 tests pass with full coverage
- Total of 106 verification feature tests pass (includes previous stories)
