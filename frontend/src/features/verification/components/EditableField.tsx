import { useState } from 'react'

import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { RotateCcw, Eye, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ConfidenceIndicator } from './ConfidenceIndicator'

/** A value the reviewer can edit in the verification interface. */
export type EditableFieldValue = string | number | boolean | null

/** A selectable choice for an enum field, paired with a human-readable label. */
export interface EditableFieldOption {
  value: string
  label: string
}

export interface FieldSourceReference {
  field: string
  confidence: number
  text: string
  page: number
  boundingBox: {
    left: number // 0-1 relative to page width
    top: number // 0-1 relative to page height
    width: number // 0-1 relative to page width
    height: number // 0-1 relative to page height
  } | null
}

export interface EditableFieldProps {
  field: string
  label: string
  value: EditableFieldValue
  originalValue: EditableFieldValue
  isChanged: boolean
  sourceRef?: FieldSourceReference
  /**
   * When true, the stored value is a 0..1 decimal fraction (e.g. 0.05) but the
   * field is shown to and edited by the reviewer as a percent number (e.g. 5).
   * The committed value stays a decimal fraction.
   */
  isPercentage?: boolean
  /**
   * When true, the value is a boolean and is shown as a Yes/No toggle instead
   * of a free-text input.
   */
  isBoolean?: boolean
  /**
   * When set, the value is one of a fixed list of choices, shown as a dropdown
   * of human-readable labels. The committed value stays the raw option value.
   */
  options?: EditableFieldOption[]
  /**
   * True when the reviewer has marked this (unedited) field as correct. An
   * edited field is always counted as verified, so this only matters for
   * fields the reviewer left unchanged.
   */
  isConfirmed?: boolean
  /** Toggle the "looks right" confirmation for an unedited field. */
  onConfirm?: () => void
  onChange: (value: EditableFieldValue) => void
  onFocus?: () => void
  className?: string
}

/**
 * Format a stored 0..1 decimal fraction for display as a percent number.
 * Rounding to 8 decimal places of the percent removes binary-float noise
 * (e.g. 0.07 * 100 = 7.000000000000001).
 */
function decimalToPercentDisplay(value: EditableFieldValue): string {
  if (value === null || value === '' || typeof value === 'boolean') return ''
  const num = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(num)) return String(value)
  const percent = Math.round(num * 100 * 1e8) / 1e8
  return String(percent)
}

/**
 * Convert a percent value the reviewer typed (5) back into the stored 0..1
 * decimal fraction (0.05). Rounded to 12 decimal places. Non-numeric input is
 * passed through unchanged so field-level validation can surface the error.
 */
function percentInputToDecimal(raw: string): string {
  const num = Number(raw)
  if (!Number.isFinite(num)) return raw
  const decimal = Math.round((num / 100) * 1e12) / 1e12
  return String(decimal)
}

/**
 * Inline editable field with change tracking and original value comparison.
 *
 * Features:
 * - Amber highlighting when value differs from original
 * - Original value shown with strikethrough
 * - Reset button to revert to original
 * - Optional confidence indicator from source extraction
 * - Optional "View Source" button to navigate to PDF
 * - Optional percent display for 0..1 decimal-fraction fields
 *
 * Story 16.6: Create Edit Interface
 */
export function EditableField({
  field,
  label,
  value,
  originalValue,
  isChanged,
  sourceRef,
  isPercentage,
  isBoolean,
  options,
  isConfirmed,
  onConfirm,
  onChange,
  onFocus,
  className,
}: EditableFieldProps) {
  // Local display buffer so percent fields can be typed naturally (including a
  // trailing decimal point) without the controlled value snapping back. Only
  // used when isPercentage is true.
  const [displayText, setDisplayText] = useState(() =>
    isPercentage ? decimalToPercentDisplay(value) : ''
  )
  // Tracks the value that produced the current buffer, so we can resync the
  // display when the value changes externally (undo/redo, reset) without an
  // effect. This is React's "adjust state during render" pattern.
  const [syncedValue, setSyncedValue] = useState<EditableFieldValue>(value)

  if (isPercentage && value !== syncedValue) {
    setSyncedValue(value)
    setDisplayText(decimalToPercentDisplay(value))
  }

  const handleReset = () => {
    onChange(originalValue)
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    if (isPercentage) {
      setDisplayText(newValue)
      const emitted = newValue === '' ? null : percentInputToDecimal(newValue)
      setSyncedValue(emitted)
      onChange(emitted)
      return
    }
    // Handle empty string as null
    onChange(newValue === '' ? null : newValue)
  }

  const booleanText = (v: EditableFieldValue): string => (v ? 'Yes' : 'No')
  const optionLabel = (v: EditableFieldValue): string =>
    options?.find((o) => o.value === v)?.label ?? String(v ?? '')

  const inputValue = isPercentage
    ? displayText
    : typeof value === 'boolean'
      ? ''
      : (value ?? '')

  // An empty text/percent/select value means the AI found nothing for this
  // field. Flag it (unless the reviewer already changed or confirmed it) so a
  // blank input reads as "not extracted, needs a look" rather than "broken".
  const isEmptyValue = value === null || value === ''
  const showNotExtracted =
    isEmptyValue && !isBoolean && !isChanged && !isConfirmed
  let originalDisplay: string
  if (isPercentage) {
    originalDisplay = decimalToPercentDisplay(originalValue)
  } else if (isBoolean) {
    originalDisplay = booleanText(originalValue)
  } else if (options) {
    originalDisplay = optionLabel(originalValue)
  } else {
    originalDisplay = String(originalValue ?? '')
  }

  return (
    <div
      id={`field-${field}`}
      className={cn(
        'p-3 rounded-lg border shadow-sm transition-all duration-fast',
        isChanged && 'bg-warning/10 border-warning/20',
        !isChanged && isConfirmed && 'bg-success/10 border-success/30',
        showNotExtracted && 'border-warning/40 border-dashed',
        className
      )}
      data-testid={`editable-field-${field}`}
      data-field={field}
      data-changed={isChanged ? 'true' : 'false'}
    >
      <div className="flex items-center justify-between mb-1">
        <label className="text-sm font-medium" htmlFor={`input-${field}`}>
          {label}
        </label>
        <div className="flex items-center gap-2">
          {sourceRef && (
            <ConfidenceIndicator
              confidence={sourceRef.confidence}
              sourceText={sourceRef.text}
            />
          )}
          {sourceRef && onFocus && sourceRef.boundingBox !== null && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onFocus}
              title="View source in PDF"
              aria-label={`View source for ${label} in PDF`}
              data-testid={`view-source-${field}`}
            >
              <Eye className="h-4 w-4" />
            </Button>
          )}
          {onConfirm && !isChanged && (
            <Button
              variant={isConfirmed ? 'default' : 'outline'}
              size="sm"
              onClick={onConfirm}
              className={cn(
                'gap-1 px-2 text-xs',
                isConfirmed && 'bg-success text-success-foreground'
              )}
              aria-label={`Confirm ${label} value`}
              aria-pressed={isConfirmed ?? false}
              title={
                isConfirmed
                  ? 'Marked as correct. Click to undo.'
                  : 'Mark this value as correct'
              }
              data-testid={`confirm-${field}`}
            >
              <Check className="h-3.5 w-3.5" />
              {isConfirmed ? 'Looks right' : 'Looks right?'}
            </Button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          {isBoolean ? (
            <div
              className="flex h-10 items-center gap-2"
              data-testid={`boolean-${field}`}
            >
              <Switch
                id={`input-${field}`}
                checked={value === true}
                onCheckedChange={(checked) => onChange(checked)}
                onFocus={onFocus}
                aria-label={label}
              />
              <span className="text-sm text-muted-foreground">
                {booleanText(value)}
              </span>
            </div>
          ) : options ? (
            <Select
              value={typeof value === 'string' ? value : ''}
              onValueChange={(next) => onChange(next)}
            >
              <SelectTrigger
                id={`input-${field}`}
                onFocus={onFocus}
                aria-label={label}
                data-testid={`select-${field}`}
              >
                <SelectValue placeholder="Not extracted. Choose a value." />
              </SelectTrigger>
              <SelectContent>
                {options.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <>
              <Input
                id={`input-${field}`}
                value={inputValue}
                onChange={handleInputChange}
                onFocus={onFocus}
                placeholder={showNotExtracted ? 'Not extracted' : undefined}
                aria-describedby={
                  showNotExtracted ? `not-extracted-${field}` : undefined
                }
                className={cn(
                  isPercentage && 'pr-7',
                  showNotExtracted && 'placeholder:text-warning-foreground'
                )}
                data-testid={`input-${field}`}
              />
              {isPercentage && (
                <span
                  className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground"
                  aria-hidden="true"
                >
                  %
                </span>
              )}
            </>
          )}
        </div>
        {isChanged && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReset}
            title="Reset to original"
            aria-label={`Reset ${label} to original value`}
            data-testid={`reset-${field}`}
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
        )}
      </div>

      {showNotExtracted && (
        <p
          id={`not-extracted-${field}`}
          className="mt-1 text-xs text-warning-foreground"
          data-testid={`not-extracted-${field}`}
        >
          The AI didn't find a value. Add one if you have it.
        </p>
      )}

      {isChanged && (
        <div
          className="mt-1 text-xs text-muted-foreground"
          data-testid={`original-value-${field}`}
        >
          Original:{' '}
          <span className="line-through">
            {originalDisplay}
            {isPercentage && originalDisplay !== '' ? '%' : ''}
          </span>
        </div>
      )}
    </div>
  )
}
