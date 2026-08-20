# Story 12.9: Create Calculation Trace Drawer

## Story Info
- **Epic**: Reconciliation Grid UI
- **Estimated Hours**: 3
- **Dependencies**: Story 12.1, Epic 6 (Calculation Engine)
- **Status**: `pending`

## User Story
Show a slide-out drawer with step-by-step calculation breakdown when clicking on a calculated cell, enabling audit trail verification.

## Acceptance Criteria
- [ ] Clicking calculated cell opens drawer from right side
- [ ] Drawer shows calculation steps with formulas and values
- [ ] Each step shows: description, formula, intermediate result
- [ ] Gross-up calculations show factor and applied amounts
- [ ] Cap calculations show limit and whether cap was applied
- [ ] Base year calculations show comparison values
- [ ] Close button and click-outside dismisses drawer
- [ ] Print-friendly calculation summary option

## Technical Specifications

Calculation trace drawer with step-by-step breakdown from CalculationStep model.

```typescript
// src/features/reconciliation/components/CalculationTraceDrawer.tsx
interface CalculationTraceDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  steps: CalculationStep[];
  finalValue: Decimal;
}

export function CalculationTraceDrawer({ isOpen, onClose, steps, finalValue }: CalculationTraceDrawerProps) {
  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-[400px]">
        <SheetHeader>
          <SheetTitle>Calculation Breakdown</SheetTitle>
        </SheetHeader>
        <div className="space-y-4 mt-4">
          {steps.map((step, i) => (
            <CalculationStepCard key={i} step={step} />
          ))}
          <div className="border-t pt-4 font-bold">
            Final: {formatCurrency(finalValue)}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

## Test Cases
- Clicking calculated cell opens drawer
- All calculation steps display correctly
- Gross-up steps show factor calculation
- Cap steps show limit comparison
- Close button dismisses drawer

## Definition of Done
- [ ] Drawer opens on cell click
- [ ] Calculation steps render correctly
- [ ] All step types supported
- [ ] Print summary works
- [ ] Unit tests passing with 95%+ coverage
