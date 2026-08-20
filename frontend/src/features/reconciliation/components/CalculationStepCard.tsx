/**
 * Calculation step card component for displaying individual calculation steps.
 *
 * Shows the step name, inputs, operation, and output in a card format
 * for audit trail review.
 */

import { AlertCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { formatMoney } from '@/lib/money'
import { formatWholeNumber } from '@/lib/number'
import type { CalculationStep } from '@/types/calculation-step'
import { hasWarning, getStepDescription } from '@/types/calculation-step'

export interface CalculationStepCardProps {
  step: CalculationStep
}

const RESERVED_TRACE_KEYS = new Set([
  'step',
  'step_order',
  'step_name',
  'name',
  'input_values',
  'input_units',
  'operation',
  'calculation',
  'description',
  'outputs',
  'output_value',
  'output_unit',
  'note',
])

// Output keys that represent the headline result of a step, in priority order.
// Used to pick a single "Result" value out of a multi-key `outputs` map emitted
// by trace formats that bundle the result alongside its supporting factors.
const RESULT_KEY_PRIORITY = [
  'total_recovery',
  'admin_fee',
  'tenant_share_after_cap',
  'excess_over_base',
  'tenant_share_before_cap',
  'grossed_total',
  'total_expenses',
  'base_year_amount',
]

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Infer a display unit for an untagged trace value from its key/value shape.
 *
 * Trace formats that omit `input_units`/`output_unit` (e.g. persisted seed or
 * legacy snapshots) would otherwise render every number as currency — showing
 * an occupancy of 0.88 as "$0.88". This keeps ratios, areas, counts, and labels
 * readable without requiring the producer to tag units.
 */
function inferUnit(key: string, value: unknown): string {
  if (typeof value === 'boolean') return 'text'
  // Ratios are occupancy/percentage/rate/factor/target fields. Note:
  // `tenant_share_*` are dollar amounts, so match `pro_rata`/`pro_rata_share`
  // explicitly rather than a bare `share`, and `_rate`/`percent` rather than a
  // bare `rate`. `*_target` (e.g. gross_up_target) is the target occupancy ratio.
  if (
    /occupancy|pro_rata|percent|ratio|factor|(^|_)target$|_rate\b|^rate\b/i.test(
      key
    )
  )
    return 'ratio'
  if (/sqft|area|square/i.test(key)) return 'area'
  if (/count|tenants|units|num_/i.test(key)) return 'count'
  // A bare year (`year`, `base_year`) is a label, not a dollar amount — render
  // "2023", never "$2,023.00". Anchored so `base_year_amount` stays currency.
  if (/(^|_)year$/i.test(key)) return 'text'
  if (/name|type|method|status|period|date/i.test(key)) return 'text'
  return 'currency'
}

/**
 * Split a trace `outputs` map into a headline result and supporting factors.
 *
 * Returns the chosen result key/value plus the remaining entries (with inferred
 * units) to surface as audit context. Falls back to the last entry when none of
 * the known result keys are present.
 */
function splitOutputs(outputs: Record<string, unknown>): {
  resultKey: string | null
  resultValue: unknown
  factors: Record<string, unknown>
  factorUnits: Record<string, string>
} {
  const keys = Object.keys(outputs)
  let resultKey: string | null =
    RESULT_KEY_PRIORITY.find((k) => k in outputs) ?? null
  if (!resultKey && keys.length > 0) {
    resultKey = keys[keys.length - 1] ?? null
  }
  const factors: Record<string, unknown> = {}
  const factorUnits: Record<string, string> = {}
  for (const k of keys) {
    if (k === resultKey) continue
    factors[k] = outputs[k]
    factorUnits[k] = inferUnit(k, outputs[k])
  }
  return {
    resultKey,
    resultValue: resultKey ? outputs[resultKey] : '0',
    factors,
    factorUnits,
  }
}

function normalizeCalculationStep(step: CalculationStep): CalculationStep {
  const rawStep = step as unknown as Record<string, unknown>

  // Some trace formats bundle the result and its supporting factors into a
  // single `outputs` map (with no `output_value`/`input_values`/units). Split
  // it so the headline value drives "Result" and the factors render as context.
  const legacyOutputs = isPlainRecord(rawStep.outputs)
    ? splitOutputs(rawStep.outputs)
    : null

  const outputValue =
    typeof rawStep.output_value === 'string' ||
    isPlainRecord(rawStep.output_value)
      ? rawStep.output_value
      : rawStep.amount !== undefined
        ? String(rawStep.amount)
        : legacyOutputs && legacyOutputs.resultValue !== undefined
          ? String(legacyOutputs.resultValue)
          : '0'

  const inputValues = isPlainRecord(rawStep.input_values)
    ? rawStep.input_values
    : legacyOutputs && Object.keys(legacyOutputs.factors).length > 0
      ? legacyOutputs.factors
      : Object.fromEntries(
          Object.entries(rawStep).filter(
            ([key]) => !RESERVED_TRACE_KEYS.has(key)
          )
        )

  const hasExplicitUnits =
    isPlainRecord(rawStep.input_units) &&
    Object.values(rawStep.input_units).every((v) => typeof v === 'string')

  const inputUnits = hasExplicitUnits
    ? (rawStep.input_units as Record<string, string>)
    : legacyOutputs && inputValues === legacyOutputs.factors
      ? legacyOutputs.factorUnits
      : // No `input_units` map at all (legacy / pre-units snapshot). The current
        // engine always emits the key — even as {} — so this only fires for
        // untagged traces, where currency-by-default would wrongly show a ratio
        // like pro_rata_share 0.05 as "$0.05". Infer each unit from its key.
        Object.fromEntries(
          Object.entries(inputValues).map(([k, v]) => [k, inferUnit(k, v)])
        )

  const outputUnit =
    typeof rawStep.output_unit === 'string'
      ? rawStep.output_unit
      : legacyOutputs && legacyOutputs.resultKey
        ? inferUnit(legacyOutputs.resultKey, legacyOutputs.resultValue)
        : undefined

  return {
    step_order:
      typeof rawStep.step_order === 'number' && rawStep.step_order > 0
        ? rawStep.step_order
        : typeof rawStep.step === 'number' && rawStep.step > 0
          ? rawStep.step
          : 1,
    step_name:
      typeof rawStep.step_name === 'string'
        ? rawStep.step_name
        : typeof rawStep.name === 'string'
          ? rawStep.name
          : typeof rawStep.step === 'string'
            ? rawStep.step
            : 'Calculation Step',
    input_values:
      Object.keys(inputValues).length > 0
        ? inputValues
        : // A trace step whose only output is the headline result has no
          // supporting factors to show — leave inputs empty (the card hides the
          // section) rather than echoing the result back as a fake input.
          legacyOutputs
          ? {}
          : { result: outputValue },
    input_units: inputUnits,
    operation:
      typeof rawStep.operation === 'string'
        ? rawStep.operation
        : typeof rawStep.calculation === 'string'
          ? rawStep.calculation
          : typeof rawStep.description === 'string'
            ? rawStep.description
            : typeof rawStep.step === 'string'
              ? rawStep.step
              : // No formula available for this legacy step — leave it blank so
                // the card hides the Formula row instead of printing a literal
                // "calculation" placeholder.
                legacyOutputs
                ? ''
                : 'calculation',
    output_value: outputValue,
    output_unit: outputUnit,
    note:
      typeof rawStep.note === 'string' || rawStep.note === null
        ? rawStep.note
        : undefined,
  }
}

/**
 * Format a value according to its unit tag.
 *
 * Defaults to 'currency' when unit is undefined or unrecognized.
 */
function formatByUnit(value: unknown, unit: string | undefined): string {
  const resolvedUnit = unit ?? 'currency'

  // Attempt numeric parse for units that need it
  const numericValue: number | null =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? isNaN(parseFloat(value))
          ? null
          : parseFloat(value)
        : null

  switch (resolvedUnit) {
    case 'ratio':
      if (numericValue !== null) {
        const sign = numericValue < 0 ? '-' : ''
        return `${sign}${Math.abs(numericValue).toFixed(4)}`
      }
      return typeof value === 'string' ? value : JSON.stringify(value)

    case 'area':
      if (numericValue !== null) {
        return (
          new Intl.NumberFormat('en-US', {
            maximumFractionDigits: 2,
          }).format(numericValue) + ' sq ft'
        )
      }
      return typeof value === 'string' ? value : JSON.stringify(value)

    case 'count':
      if (numericValue !== null) {
        return formatWholeNumber(numericValue)
      }
      return typeof value === 'string' ? value : JSON.stringify(value)

    case 'date':
    case 'text':
      return typeof value === 'string' ? value : JSON.stringify(value)

    default:
      // 'currency' and any unknown unit → exact-decimal money render.
      // Backend trace values arrive as exact decimal strings; formatMoney parses
      // a string directly (no parseFloat round-trip) so large CAM figures on the
      // calculation audit trail keep every digit (F-430). A non-numeric string is
      // returned unchanged; a numeric input is already a float, passed through.
      if (typeof value === 'string' || typeof value === 'number') {
        return formatMoney(value)
      }
      return JSON.stringify(value)
  }
}

/**
 * Format output value based on type and optional unit tag.
 */
function formatOutputValue(
  output: string | Record<string, unknown>,
  unit: string | undefined
): string {
  if (isPlainRecord(output)) {
    return JSON.stringify(output, null, 2)
  }
  return formatByUnit(output, unit)
}

/**
 * Format input value based on type and optional unit tag.
 */
function formatInputValue(value: unknown, unit: string | undefined): string {
  return formatByUnit(value, unit)
}

/**
 * Individual calculation step card.
 *
 * Features:
 * - Step number and name display
 * - Input values with formatting
 * - Formula/operation display
 * - Output result with formatting
 * - Warning indicator for notes
 * - Structured layout for audit clarity
 */
export function CalculationStepCard({ step }: CalculationStepCardProps) {
  const displayStep = normalizeCalculationStep(step)
  const showWarning = hasWarning(displayStep)
  const description = getStepDescription(displayStep.step_name)

  return (
    <Card
      data-testid="calculation-step-card"
      className={cn(
        'relative shadow-sm',
        showWarning && 'border-warning bg-warning/10'
      )}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <CardTitle className="text-sm font-semibold">
            Step {displayStep.step_order}: {displayStep.step_name}
          </CardTitle>
          {showWarning && (
            <AlertCircle className="h-4 w-4 text-warning flex-shrink-0" />
          )}
        </div>
        {description !== displayStep.step_name && (
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        )}
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {/* Input Values */}
        {Object.keys(displayStep.input_values).length > 0 && (
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-1">
              Inputs:
            </div>
            <div className="space-y-1 pl-3">
              {Object.entries(displayStep.input_values).map(([key, value]) => (
                <div key={key} className="text-xs">
                  <span className="font-mono text-muted-foreground">
                    {key}:
                  </span>{' '}
                  <span className="font-mono font-semibold tabular-nums">
                    {formatInputValue(value, displayStep.input_units?.[key])}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Operation/Formula (hidden when a step carries no formula) */}
        {displayStep.operation.trim().length > 0 && (
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-1">
              Formula:
            </div>
            <div className="bg-muted/50 rounded px-3 py-2 font-mono text-xs">
              {displayStep.operation}
            </div>
          </div>
        )}

        {/* Output Value */}
        <div>
          <div className="text-xs font-medium text-muted-foreground mb-1">
            Result:
          </div>
          <div className="font-mono font-bold tabular-nums">
            {formatOutputValue(
              displayStep.output_value,
              displayStep.output_unit
            )}
          </div>
        </div>

        {/* Note/Warning */}
        {displayStep.note && (
          <div
            className={cn(
              'text-xs rounded p-2',
              showWarning
                ? 'bg-warning/10 text-warning-foreground border border-warning/20'
                : 'bg-muted text-muted-foreground'
            )}
          >
            <span className="font-medium">
              {showWarning ? 'Warning: ' : 'Note: '}
            </span>
            {displayStep.note}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
