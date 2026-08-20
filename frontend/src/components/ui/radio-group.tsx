import * as React from 'react'
import * as RadioGroupPrimitive from '@radix-ui/react-radio-group'
import { Circle } from 'lucide-react'

import { cn } from '@/lib/utils'

const RadioGroup = React.forwardRef<
  React.ComponentRef<typeof RadioGroupPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Root>
>(({ className, ...props }, ref) => {
  return (
    <RadioGroupPrimitive.Root
      className={cn('grid gap-2', className)}
      {...props}
      ref={ref}
      data-testid="radio-group"
    />
  )
})
RadioGroup.displayName = RadioGroupPrimitive.Root.displayName

const RadioGroupItem = React.forwardRef<
  React.ComponentRef<typeof RadioGroupPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item>
>(({ className, ...props }, ref) => {
  return (
    <RadioGroupPrimitive.Item
      ref={ref}
      className={cn(
        'aspect-square h-4 w-4 rounded-full border border-primary text-primary ring-offset-background',
        'transition-all duration-fast ease-out-expo',
        'hover:border-primary/80 hover:bg-primary/5',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'data-[state=checked]:shadow-sm',
        className
      )}
      data-testid={`radio-item-${props.value}`}
      {...props}
    >
      <RadioGroupPrimitive.Indicator className="flex items-center justify-center">
        <Circle className="h-2.5 w-2.5 fill-current text-current" />
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  )
})
RadioGroupItem.displayName = RadioGroupPrimitive.Item.displayName

export interface RadioGroupWithLabelProps extends React.ComponentPropsWithoutRef<
  typeof RadioGroupPrimitive.Root
> {
  /** Array of radio options */
  options: Array<{
    value: string
    label: string
    description?: string | undefined
    disabled?: boolean | undefined
  }>
  /** Layout direction */
  orientation?: 'horizontal' | 'vertical' | undefined
}

const RadioGroupWithLabels = React.forwardRef<
  React.ComponentRef<typeof RadioGroupPrimitive.Root>,
  RadioGroupWithLabelProps
>(({ className, options, orientation = 'vertical', ...props }, ref) => {
  return (
    <RadioGroup
      ref={ref}
      className={cn(
        orientation === 'horizontal' ? 'flex flex-wrap gap-4' : 'grid gap-3',
        className
      )}
      {...props}
    >
      {options.map((option) => {
        const id = `${props.name || 'radio'}-${option.value}`

        return (
          <div key={option.value} className="flex items-start space-x-3">
            <RadioGroupItem
              value={option.value}
              id={id}
              disabled={option.disabled}
            />
            <div className="grid gap-1.5 leading-none">
              <label
                htmlFor={id}
                className={cn(
                  'text-sm font-medium leading-none',
                  'peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
                  option.disabled && 'cursor-not-allowed opacity-70'
                )}
              >
                {option.label}
              </label>
              {option.description && (
                <p className="text-sm text-muted-foreground">
                  {option.description}
                </p>
              )}
            </div>
          </div>
        )
      })}
    </RadioGroup>
  )
})
RadioGroupWithLabels.displayName = 'RadioGroupWithLabels'

export { RadioGroup, RadioGroupItem, RadioGroupWithLabels }
