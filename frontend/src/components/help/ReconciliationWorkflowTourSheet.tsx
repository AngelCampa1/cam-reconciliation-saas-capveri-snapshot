import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'

interface ReconciliationWorkflowTourSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const STEPS = [
  {
    label: 'Upload your GL file',
    detail:
      'CSV or Excel export from Yardi/MRI. Use the Imports tab on the property page.',
  },
  {
    label: 'Upload billing statement',
    detail: 'Optional, for pass-through expense verification.',
  },
  {
    label: 'Configure pool mappings',
    detail:
      'Go to the property Pools tab and map GL patterns to each expense pool.',
  },
  {
    label: 'Return here and click Run reconciliation',
    detail: 'The system allocates expenses to tenants based on your mappings.',
  },
  {
    label: 'Review',
    detail:
      'Check the Variance Report and GL Narrative for anomalies before finalizing.',
  },
  {
    label: 'Finalize',
    detail:
      'Locks the reconciliation and enables export and demand letter generation.',
  },
]

export function ReconciliationWorkflowTourSheet({
  open,
  onOpenChange,
}: ReconciliationWorkflowTourSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Reconciliation Workflow</SheetTitle>
          <SheetDescription>
            Follow these steps to complete a CAM reconciliation.
          </SheetDescription>
        </SheetHeader>

        <ol className="mt-6 space-y-4">
          {STEPS.map((step, index) => (
            <li key={step.label} className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                {index + 1}
              </span>
              <div className="space-y-1">
                <p className="text-sm font-medium">{step.label}</p>
                <p className="text-sm text-muted-foreground">{step.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </SheetContent>
    </Sheet>
  )
}
