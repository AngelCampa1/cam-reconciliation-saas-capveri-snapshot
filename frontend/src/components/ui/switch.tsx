import * as React from 'react'
import * as SwitchPrimitives from '@radix-ui/react-switch'

import { cn } from '@/lib/utils'

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      'peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent',
      // Invisible 40px-tall hit area centered on the 24px track so the tap
      // target meets the 40px touch floor without enlarging the visible switch.
      // Width matches the track, so it never overlaps an adjacent label.
      'relative before:absolute before:left-0 before:top-1/2 before:h-10 before:w-full before:-translate-y-1/2 before:content-[""]',
      'transition-all duration-fast ease-out-expo',
      'hover:data-[state=unchecked]:bg-input/80',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
      'disabled:cursor-not-allowed disabled:opacity-50',
      'data-[state=checked]:bg-primary data-[state=unchecked]:bg-input',
      className
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        'pointer-events-none block h-5 w-5 rounded-full bg-background ring-0',
        'shadow-sm transition-all duration-fast ease-out-expo',
        'data-[state=checked]:translate-x-5 data-[state=checked]:shadow-sm',
        'data-[state=unchecked]:translate-x-0'
      )}
    />
  </SwitchPrimitives.Root>
))
Switch.displayName = SwitchPrimitives.Root.displayName

export { Switch }
