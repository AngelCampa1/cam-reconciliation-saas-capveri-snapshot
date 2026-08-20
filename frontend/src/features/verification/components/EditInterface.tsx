import { Button } from '@/components/ui/button'
import { Undo2, Redo2 } from 'lucide-react'
import { formatMoney } from '@/lib/money'
import {
  EditableField,
  type FieldSourceReference,
  type EditableFieldValue,
  type EditableFieldOption,
} from './EditableField'
import type {
  LeaseRecoveryProfile,
  BaseYearAdjustmentItem,
} from '@/types/lease-recovery-profile'

export interface EditInterfaceProps {
  profile: LeaseRecoveryProfile
  originalProfile: LeaseRecoveryProfile
  sourceReferences: FieldSourceReference[]
  onFieldChange: (field: string, value: EditableFieldValue) => void
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
  onFieldFocus: (field: string) => void
  confidenceFilter?: 'all' | 'low'
  /** Fields the reviewer has marked correct without editing. */
  confirmedFields?: string[]
  /** Toggle the "looks right" confirmation for an unedited field. */
  onConfirmField?: (field: string) => void
}

// Cap type labels mirror the lease recovery profile editor
// (RecoveryProfileEditor) so reviewers see the same wording everywhere.
const CAP_TYPE_OPTIONS: EditableFieldOption[] = [
  { value: 'none', label: 'No Cap' },
  { value: 'non_cumulative', label: 'Non-Cumulative' },
  { value: 'cumulative', label: 'Cumulative' },
  { value: 'cumulative_compounding', label: 'Cumulative Compounding' },
]

const FIELD_DEFINITIONS: Record<
  string,
  {
    label: string
    isPercentage?: boolean
    isBoolean?: boolean
    options?: EditableFieldOption[]
  }
> = {
  base_year: { label: 'Base Year' },
  base_year_amount: { label: 'Base Year Amount' },
  gross_up_base_year: { label: 'Gross-Up Base Year', isBoolean: true },
  pro_rata_share: { label: 'Pro-Rata Share', isPercentage: true },
  cap_type: { label: 'Cap Type', options: CAP_TYPE_OPTIONS },
  cap_rate: { label: 'Cap Rate', isPercentage: true },
  admin_fee_percentage: { label: 'Admin Fee', isPercentage: true },
}

/**
 * The canonical set of reviewer-confirmable fields, in display order. The
 * verification progress meter is keyed off this list (not the AI's
 * source_references), so an extraction that returned no source references still
 * shows real progress as the reviewer marks fields correct (F2 fix).
 */
export const VERIFIABLE_FIELD_KEYS = Object.keys(FIELD_DEFINITIONS)

/**
 * Edit interface for lease recovery profile with change tracking and undo/redo.
 *
 * Features:
 * - Inline editing of all extracted fields
 * - Undo/Redo functionality
 * - Change highlighting via EditableField
 * - Source reference integration
 * - Field-to-PDF navigation
 *
 * Story 16.6: Create Edit Interface
 */
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
  confidenceFilter,
  confirmedFields,
  onConfirmField,
}: EditInterfaceProps) {
  return (
    <div className="flex flex-col h-full" data-testid="edit-interface">
      <div className="flex flex-col gap-3 p-4 border-b bg-muted/30 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold">Extracted Lease Terms</h2>
        <div className="flex items-center gap-2 self-end sm:self-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={onUndo}
            disabled={!canUndo}
            data-testid="undo-button"
          >
            <Undo2 className="h-4 w-4 mr-1" /> Undo
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onRedo}
            disabled={!canRedo}
            data-testid="redo-button"
          >
            <Redo2 className="h-4 w-4 mr-1" /> Redo
          </Button>
        </div>
      </div>

      <div
        className="flex-1 overflow-auto p-4 space-y-3"
        data-testid="fields-container"
      >
        {Object.entries(FIELD_DEFINITIONS)
          .filter(([field]) => {
            if (confidenceFilter !== 'low') return true
            const sourceRef = sourceReferences.find((r) => r.field === field)
            return !sourceRef || sourceRef.confidence < 0.7
          })
          .map(([field, def]) => {
            const profileKey = field as keyof LeaseRecoveryProfile
            const value = profile[profileKey]
            const originalValue = originalProfile[profileKey]

            const sourceRef = sourceReferences.find((r) => r.field === field)
            return (
              <EditableField
                key={field}
                field={field}
                label={def.label}
                value={value as EditableFieldValue}
                originalValue={originalValue as EditableFieldValue}
                isChanged={value !== originalValue}
                {...(def.isPercentage && { isPercentage: def.isPercentage })}
                {...(def.isBoolean && { isBoolean: def.isBoolean })}
                {...(def.options && { options: def.options })}
                {...(sourceRef && { sourceRef })}
                isConfirmed={confirmedFields?.includes(field) ?? false}
                {...(onConfirmField && {
                  onConfirm: () => onConfirmField(field),
                })}
                onChange={(newValue) => onFieldChange(field, newValue)}
                onFocus={() => onFieldFocus(field)}
              />
            )
          })}

        {/* Base year adjustments (read-only, shown when base year is set) */}
        {profile.base_year && (
          <div
            className="mt-2 border-t pt-3"
            data-testid="base-year-adjustments-section"
          >
            <h3 className="text-sm font-medium mb-2">
              Base year adjustments (new services)
            </h3>
            {(profile.base_year_adjustments ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No new-service adjustments recorded.
              </p>
            ) : (
              <ul className="space-y-2">
                {(
                  profile.base_year_adjustments as BaseYearAdjustmentItem[]
                ).map((adj, i) => (
                  <li
                    key={i}
                    className="rounded-md border p-2 text-xs space-y-0.5"
                  >
                    <p className="font-medium">{adj.service_name}</p>
                    <p className="text-muted-foreground">
                      Imputed cost:{' '}
                      <span className="font-mono tabular-nums">
                        {formatMoney(adj.imputed_amount)}
                      </span>
                    </p>
                    <p className="text-muted-foreground">{adj.justification}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
