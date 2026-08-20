import * as React from 'react'
import * as CheckboxPrimitive from '@radix-ui/react-checkbox'
import { Check, Minus } from 'lucide-react'

import { cn } from '@/lib/utils'

const Checkbox = React.forwardRef<
  React.ComponentRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      'peer h-4 w-4 shrink-0 rounded-sm border border-primary ring-offset-background',
      'transition-all duration-fast ease-out-expo',
      'hover:border-primary/80 hover:bg-primary/5',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
      'disabled:cursor-not-allowed disabled:opacity-50',
      'data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=checked]:shadow-sm',
      'data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground data-[state=indeterminate]:shadow-sm',
      className
    )}
    data-testid="checkbox"
    {...props}
  >
    <CheckboxPrimitive.Indicator
      className={cn('flex items-center justify-center text-current')}
    >
      {props.checked === 'indeterminate' ? (
        <Minus className="h-3 w-3" />
      ) : (
        <Check className="h-3 w-3" />
      )}
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
))
Checkbox.displayName = CheckboxPrimitive.Root.displayName

export interface CheckboxWithLabelProps extends React.ComponentPropsWithoutRef<
  typeof CheckboxPrimitive.Root
> {
  /** Label text displayed next to checkbox */
  label: string
  /** Optional description below the label */
  description?: string | undefined
}

const CheckboxWithLabel = React.forwardRef<
  React.ComponentRef<typeof CheckboxPrimitive.Root>,
  CheckboxWithLabelProps
>(({ className, label, description, id, ...props }, ref) => {
  const generatedId = React.useId()
  const checkboxId = id || generatedId

  return (
    <div className="flex items-start space-x-3">
      <Checkbox ref={ref} id={checkboxId} className={className} {...props} />
      <div className="grid gap-1.5 leading-none">
        <label
          htmlFor={checkboxId}
          className={cn(
            'text-sm font-medium leading-none',
            'peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
            props.disabled && 'cursor-not-allowed opacity-70'
          )}
        >
          {label}
        </label>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
    </div>
  )
})
CheckboxWithLabel.displayName = 'CheckboxWithLabel'

export interface CheckboxGroupProps {
  /** Array of checkbox options */
  options: Array<{
    value: string
    label: string
    description?: string | undefined
    disabled?: boolean | undefined
  }>
  /** Currently selected values */
  value: string[]
  /** Callback when selection changes */
  onChange: (value: string[]) => void
  /** Optional name for the group */
  name?: string | undefined
  /** Whether all checkboxes are disabled */
  disabled?: boolean | undefined
  /** Additional CSS classes */
  className?: string | undefined
}

const CheckboxGroup = React.forwardRef<HTMLDivElement, CheckboxGroupProps>(
  ({ options, value, onChange, name, disabled, className }, ref) => {
    const handleChange = (optionValue: string, checked: boolean) => {
      if (checked) {
        onChange([...value, optionValue])
      } else {
        onChange(value.filter((v) => v !== optionValue))
      }
    }

    return (
      <div
        ref={ref}
        role="group"
        aria-label={name}
        className={cn('space-y-3', className)}
        data-testid="checkbox-group"
      >
        {options.map((option) => (
          <CheckboxWithLabel
            key={option.value}
            label={option.label}
            description={option.description}
            checked={value.includes(option.value)}
            onCheckedChange={(checked) =>
              handleChange(option.value, checked === true)
            }
            disabled={disabled || option.disabled}
            name={name}
            value={option.value}
          />
        ))}
      </div>
    )
  }
)
CheckboxGroup.displayName = 'CheckboxGroup'

export { Checkbox, CheckboxWithLabel, CheckboxGroup }
