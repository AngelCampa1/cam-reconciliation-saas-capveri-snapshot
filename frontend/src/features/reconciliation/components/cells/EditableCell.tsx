/**
 * EditableCell component for inline editing.
 *
 * Supports keyboard navigation, validation, and different input types.
 */

import { useState, useRef, useEffect, KeyboardEvent } from 'react'
import { cn } from '@/lib/utils'
import { CurrencyCell, TextCell } from './CellRenderers'

export interface EditableCellProps {
  value: string | number
  onSave: (newValue: string | number) => void
  validate?: (value: string) => boolean
  type: 'text' | 'currency' | 'number'
}

/**
 * Editable cell component with inline editing support.
 *
 * Features:
 * - Double-click or Enter to activate edit mode
 * - Escape to cancel
 * - Tab or Enter to save
 * - Blur to save
 * - Input validation
 * - Visual indicator for edit mode
 * - Numeric keyboard on mobile for currency/number
 */
export function EditableCell({
  value,
  onSave,
  validate,
  type,
}: EditableCellProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(String(value))
  const inputRef = useRef<HTMLInputElement>(null)

  // Reset edit value when prop value changes
  useEffect(() => {
    setEditValue(String(value))
  }, [value])

  // Auto-focus input when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  const handleSave = () => {
    // Validate if validator provided
    if (validate && !validate(editValue)) {
      return // Stay in edit mode if validation fails
    }

    // Convert to appropriate type
    const saveValue =
      type === 'number' || type === 'currency' ? editValue : editValue

    onSave(saveValue)
    setIsEditing(false)
  }

  const handleCancel = () => {
    setEditValue(String(value)) // Reset to original
    setIsEditing(false)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSave()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      handleCancel()
    } else if (e.key === 'Tab') {
      // Let Tab bubble for focus management, but save first
      handleSave()
    }
  }

  const handleDoubleClick = () => {
    setIsEditing(true)
  }

  const handleKeyDownReadOnly = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      setIsEditing(true)
    }
  }

  const handleBlur = () => {
    handleSave()
  }

  // Render edit mode
  if (isEditing) {
    const inputMode =
      type === 'currency' || type === 'number' ? 'decimal' : 'text'

    return (
      <div data-editing="true" className="relative">
        <input
          ref={inputRef}
          type="text"
          inputMode={inputMode}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          className={cn(
            'w-full px-2 py-1 border-2 border-primary rounded',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            'bg-background',
            type === 'currency' || type === 'number'
              ? 'font-mono text-right tabular-nums'
              : ''
          )}
        />
      </div>
    )
  }

  // Render read-only mode
  const displayValue =
    type === 'currency' ? (
      <CurrencyCell value={String(value)} />
    ) : type === 'number' ? (
      <span className="font-mono tabular-nums">{value}</span>
    ) : (
      <TextCell value={String(value)} />
    )

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Edit cell"
      onDoubleClick={handleDoubleClick}
      onKeyDown={handleKeyDownReadOnly}
      className={cn(
        'cursor-pointer hover:bg-muted/50 transition-colors duration-fast',
        'px-2 py-1 rounded min-h-[2rem] flex items-center',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
      )}
    >
      {displayValue}
    </div>
  )
}
