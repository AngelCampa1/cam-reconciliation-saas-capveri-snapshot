/**
 * Bottom Navigation Component
 *
 * Mobile-optimized bottom tab bar for primary navigation.
 * Features:
 * - 5 primary navigation items
 * - Active state highlighting
 * - 44px minimum touch targets
 * - Safe area support for notched devices
 * - Hidden on desktop (md breakpoint and above)
 */
import { useLocation, useNavigate } from 'react-router-dom'
import {
  Home,
  Building2,
  Calculator,
  Upload,
  MoreHorizontal,
} from 'lucide-react'
import { cn } from '@/lib/utils'

export interface NavItem {
  /** Navigation label */
  label: string
  /** Route path */
  path: string
  /** Icon component */
  icon: React.ComponentType<{ className?: string }>
  /** Test ID for testing */
  testId: string
  /** Whether this opens a drawer instead of navigating */
  opensDrawer?: boolean
}

const NAV_ITEMS: NavItem[] = [
  {
    label: 'Dashboard',
    path: '/dashboard',
    icon: Home,
    testId: 'nav-dashboard',
  },
  {
    label: 'Properties',
    path: '/properties',
    icon: Building2,
    testId: 'nav-properties',
  },
  {
    label: 'Documents',
    path: '/ingestion',
    icon: Upload,
    testId: 'nav-upload',
  },
  {
    label: 'Reconcile',
    path: '/reconciliations',
    icon: Calculator,
    testId: 'nav-reconcile',
  },
  {
    label: 'More',
    path: '#',
    icon: MoreHorizontal,
    testId: 'nav-more',
    opensDrawer: true,
  },
]

export interface BottomNavProps {
  /** Callback when More button is clicked */
  onMoreClick?: () => void
}

export function BottomNav({ onMoreClick }: BottomNavProps = {}) {
  const location = useLocation()
  const navigate = useNavigate()

  const isActive = (path: string) => {
    // Check if current path starts with the nav item path
    return location.pathname.startsWith(path)
  }

  const handleClick = (item: NavItem) => {
    // Drawer items never navigate; they only open the mobile nav drawer.
    // Without this guard a missing onMoreClick would route to the "#" path.
    if (item.opensDrawer) {
      onMoreClick?.()
    } else {
      navigate(item.path)
    }
  }

  return (
    <nav
      className={cn(
        'fixed bottom-0 left-0 right-0 z-dropdown md:hidden',
        // Glass effect background
        'bg-card/80 backdrop-blur-lg',
        // Refined border and shadow
        'border-t border-border-subtle',
        'shadow-elevation-2'
      )}
      style={{
        // Safe area support for notched devices (iOS)
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
      role="navigation"
      aria-label="Primary navigation"
      data-testid="bottom-nav"
    >
      <div className="flex items-center justify-around">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon
          const active = !item.opensDrawer && isActive(item.path)

          return (
            <button
              key={item.path}
              onClick={() => handleClick(item)}
              className={cn(
                'relative flex min-h-[56px] min-w-[44px] flex-1 flex-col items-center justify-center gap-1 rounded-full px-2 py-2',
                'transition-colors duration-fast',
                // Keyboard focus parity: these are primary nav buttons. Inset
                // ring (not offset) so it never clips against the fixed bar edge.
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                active
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              aria-label={item.label}
              aria-current={active ? 'page' : undefined}
              aria-haspopup={item.opensDrawer ? 'menu' : undefined}
              data-testid={item.testId}
            >
              {/* Active indicator dot */}
              {active && (
                <span
                  className="absolute top-1.5 h-1 w-1 rounded-full bg-primary"
                  aria-hidden="true"
                />
              )}
              <Icon
                className={cn('h-5 w-5', active && 'text-primary')}
                aria-hidden="true"
              />
              <span
                className={cn(
                  'text-xs',
                  active ? 'font-semibold' : 'font-medium'
                )}
              >
                {item.label}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
