# Story 12.3: Create Editable Cells

## Story Info
- **Epic**: Reconciliation Grid UI
- **Estimated Hours**: 4
- **Dependencies**: Story 12.2
- **Status**: `pending`

## User Story
Enable inline cell editing for adjustable values (manual overrides, notes) with validation and save functionality.

## Acceptance Criteria
- [ ] Double-click or Enter key activates edit mode
- [ ] Escape key cancels edit and restores original value
- [ ] Tab key saves and moves to next editable cell
- [ ] Input validation prevents invalid values (negative amounts, invalid dates)
- [ ] Visual indicator shows cell is in edit mode
- [ ] Blur event saves the value
- [ ] Edit mode input matches cell width
- [ ] Currency cells use numeric keyboard on mobile

## Technical Specifications

Editable cell component with controlled input and validation.

```typescript
// src/features/reconciliation/components/cells/EditableCell.tsx
interface EditableCellProps {
  value: string | number;
  onSave: (newValue: string | number) => void;
  validate?: (value: string) => boolean;
  type: 'text' | 'currency' | 'number';
}

export function EditableCell({ value, onSave, validate, type }: EditableCellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(String(value));

  const handleSave = () => {
    if (!validate || validate(editValue)) {
      onSave(type === 'number' ? parseFloat(editValue) : editValue);
    }
    setIsEditing(false);
  };
  // ... keyboard handlers
}
```

## Test Cases
- Double-click activates edit mode
- Escape cancels without saving
- Tab saves and moves focus
- Invalid input shows validation error
- Blur saves the current value

## Definition of Done
- [ ] EditableCell component works correctly
- [ ] Keyboard navigation complete
- [ ] Validation prevents bad data
- [ ] Focus management works properly
- [ ] Unit tests passing with 95%+ coverage
