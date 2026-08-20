/**
 * Editable list of "other system" charges for an explicit comparison.
 *
 * Each row is a tenant name plus the amount that system charged. Resolved
 * rows can also carry a lease id. Amounts are kept as raw strings (never
 * coerced to float) and passed straight to the backend.
 */
import type { ExplicitCharge } from '@/api/comparison'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Plus, Trash2 } from 'lucide-react'

/** One editable charge row (local form state). */
export interface ChargeDraft {
  leaseId?: string | null
  tenantName: string
  poolId?: string | null
  amount: string
}

interface ExplicitChargesEditorProps {
  charges: ChargeDraft[]
  onChange: (charges: ChargeDraft[]) => void
}

export function ExplicitChargesEditor({
  charges,
  onChange,
}: ExplicitChargesEditorProps) {
  const update = (index: number, patch: Partial<ChargeDraft>) => {
    onChange(
      charges.map((row, i) => (i === index ? { ...row, ...patch } : row))
    )
  }

  const addRow = () => {
    onChange([...charges, { tenantName: '', amount: '' }])
  }

  const removeRow = (index: number) => {
    onChange(charges.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-3" data-testid="explicit-charges-editor">
      <div className="space-y-2">
        {charges.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Add a row for each tenant charge from the other system.
          </p>
        ) : (
          charges.map((row, index) => (
            <div
              key={index}
              className="flex flex-col gap-2 sm:flex-row sm:items-end"
            >
              <div className="flex-1 space-y-1">
                <Label
                  htmlFor={`charge-name-${index}`}
                  className="text-xs text-muted-foreground"
                >
                  Tenant name
                </Label>
                <Input
                  id={`charge-name-${index}`}
                  value={row.tenantName}
                  onChange={(e) => {
                    update(index, {
                      tenantName: e.target.value,
                      leaseId: null,
                      poolId: null,
                    })
                  }}
                  placeholder="Tenant name"
                />
              </div>
              <div className="w-full space-y-1 sm:w-40">
                <Label
                  htmlFor={`charge-amount-${index}`}
                  className="text-xs text-muted-foreground"
                >
                  Amount charged
                </Label>
                <Input
                  id={`charge-amount-${index}`}
                  inputMode="decimal"
                  value={row.amount}
                  onChange={(e) => update(index, { amount: e.target.value })}
                  placeholder="0.00"
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0"
                onClick={() => removeRow(index)}
                aria-label={`Remove charge row ${index + 1}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))
        )}
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={addRow}
        className="min-h-[44px]"
      >
        <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
        Add charge
      </Button>
    </div>
  )
}

/**
 * Map editor drafts to the API's ExplicitCharge shape, dropping fully-blank
 * rows (no name and no amount). A blank amount becomes "0" so the backend still
 * sees the row as a real (zero) charge rather than rejecting it.
 */
export function draftsToCharges(charges: ChargeDraft[]): ExplicitCharge[] {
  return charges
    .filter(
      (row) =>
        (row.leaseId?.trim() ?? '') !== '' ||
        row.tenantName.trim() !== '' ||
        (row.poolId?.trim() ?? '') !== '' ||
        row.amount.trim() !== ''
    )
    .map((row) => ({
      ...(row.leaseId?.trim() ? { lease_id: row.leaseId.trim() } : {}),
      tenant_name: row.tenantName.trim() === '' ? null : row.tenantName.trim(),
      ...(row.poolId?.trim() ? { pool_id: row.poolId.trim() } : {}),
      amount: row.amount.trim() === '' ? '0' : row.amount.trim(),
    }))
}
