import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { GL_PATTERN_ROWS } from './gl-pattern-rows'

interface PoolMappingTourSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const STEPS = [
  {
    label: 'Navigate to your property',
    detail: 'Open the property detail page, then click the Pools tab.',
  },
  {
    label: "You'll see your expense pools",
    detail: 'Click the Mappings badge on any pool to manage its GL patterns.',
  },
  {
    label: 'Enter a GL account pattern',
    detail: null,
  },
  {
    label: 'Set Allocation %',
    detail: 'Usually 100 unless this expense is split across multiple pools.',
  },
  {
    label: 'Repeat for each pool',
    detail:
      'Once all pools have at least one mapping, you can run the reconciliation.',
  },
]

export function PoolMappingTourSheet({
  open,
  onOpenChange,
}: PoolMappingTourSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>How to Configure Pool Mappings</SheetTitle>
          <SheetDescription>
            Follow these steps to map GL accounts to expense pools.
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
                {step.detail && (
                  <p className="text-sm text-muted-foreground">{step.detail}</p>
                )}
                {index === 2 && (
                  <>
                    <p className="text-sm text-muted-foreground">
                      For example, <code className="font-mono">4*</code> for all
                      accounts starting with 4.
                    </p>
                    <Table className="mt-2 text-xs">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="py-1">Pattern</TableHead>
                          <TableHead className="py-1">Matches</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {GL_PATTERN_ROWS.map((row) => (
                          <TableRow key={row.pattern}>
                            <TableCell className="py-1 font-mono">
                              {row.pattern}
                            </TableCell>
                            <TableCell className="py-1">
                              {row.meaning}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </>
                )}
              </div>
            </li>
          ))}
        </ol>
      </SheetContent>
    </Sheet>
  )
}
