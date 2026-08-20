import * as React from 'react'
import * as TabsPrimitive from '@radix-ui/react-tabs'

import { cn } from '@/lib/utils'

const Tabs = TabsPrimitive.Root

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      'inline-flex h-10 items-center justify-center rounded-button p-1 text-muted-foreground',
      // Enhanced surface with border and shadow
      'bg-surface-raised border border-border-subtle shadow-sm',
      // Smooth transitions
      'transition-all duration-fast',
      className
    )}
    {...props}
  />
))
TabsList.displayName = TabsPrimitive.List.displayName

const ResponsiveTabsList = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('-mx-1 overflow-x-auto px-1 pb-1', className)}
    data-testid="responsive-tabs-list"
    {...props}
  >
    <TabsList className="min-w-max justify-start">{children}</TabsList>
  </div>
))
ResponsiveTabsList.displayName = 'ResponsiveTabsList'

/**
 * A tab list that scrolls horizontally when its triggers overflow the
 * available width (common on narrow/mobile viewports). When content is
 * clipped, a soft fade appears on the clipped edge so the user can tell
 * there are more tabs to scroll to. The fades hide once you reach an edge.
 */
const ScrollableTabsList = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => {
  const scrollRef = React.useRef<HTMLDivElement | null>(null)
  const [canScrollLeft, setCanScrollLeft] = React.useState(false)
  const [canScrollRight, setCanScrollRight] = React.useState(false)

  const updateFades = React.useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const { scrollLeft, scrollWidth, clientWidth } = el
    // 1px tolerance avoids flicker from sub-pixel rounding.
    setCanScrollLeft(scrollLeft > 1)
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 1)
  }, [])

  React.useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    updateFades()
    el.addEventListener('scroll', updateFades, { passive: true })
    const observer = new ResizeObserver(updateFades)
    observer.observe(el)
    return () => {
      el.removeEventListener('scroll', updateFades)
      observer.disconnect()
    }
  }, [updateFades])

  const setRefs = React.useCallback(
    (node: HTMLDivElement | null) => {
      scrollRef.current = node
      if (typeof ref === 'function') ref(node)
      else if (ref) ref.current = node
    },
    [ref]
  )

  return (
    <div className="relative">
      <div
        ref={setRefs}
        className={cn('-mx-1 overflow-x-auto px-1 pb-1', className)}
        data-testid="scrollable-tabs-list"
        {...props}
      >
        <TabsList className="min-w-max justify-start">{children}</TabsList>
      </div>
      <div
        aria-hidden="true"
        data-testid="scrollable-tabs-fade-left"
        className={cn(
          'pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-surface-raised to-transparent transition-opacity duration-fast',
          canScrollLeft ? 'opacity-100' : 'opacity-0'
        )}
      />
      <div
        aria-hidden="true"
        data-testid="scrollable-tabs-fade-right"
        className={cn(
          'pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-surface-raised to-transparent transition-opacity duration-fast',
          canScrollRight ? 'opacity-100' : 'opacity-0'
        )}
      />
    </div>
  )
})
ScrollableTabsList.displayName = 'ScrollableTabsList'

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      'inline-flex items-center justify-center whitespace-nowrap rounded-button px-3 py-1.5 text-sm font-medium ring-offset-background',
      'transition-all duration-fast ease-out-expo',
      'hover:text-foreground',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
      'disabled:pointer-events-none disabled:opacity-50',
      // Enhanced active state with elevation
      'data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-elevation-1',
      className
    )}
    {...props}
  />
))
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      'mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
      className
    )}
    {...props}
  />
))
TabsContent.displayName = TabsPrimitive.Content.displayName

export {
  Tabs,
  TabsList,
  ResponsiveTabsList,
  ScrollableTabsList,
  TabsTrigger,
  TabsContent,
}
