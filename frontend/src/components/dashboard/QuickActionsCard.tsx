/**
 * Quick Actions Card Component
 *
 * Displays common actions in a clean grid for quick access.
 */
import { Building2, Upload, Calculator, TrendingUp } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { DashboardTier } from './dashboard-tier'

const paidActions = [
  {
    icon: Building2,
    label: 'Add Property',
    href: '/properties/new',
    color: 'text-primary hover:bg-primary/10',
  },
  {
    icon: Upload,
    label: 'Upload GL',
    href: '/ingestion',
    color: 'text-primary hover:bg-primary/10',
  },
  {
    icon: Calculator,
    label: 'Reconcile',
    href: '/reconciliations',
    color: 'text-primary hover:bg-primary/10',
  },
  {
    icon: TrendingUp,
    label: 'Portfolio',
    href: '/portfolio',
    color: 'text-primary hover:bg-primary/10',
  },
]

const freeActions = [
  {
    icon: Building2,
    label: 'Add Property',
    href: '/properties/new',
    color: 'text-primary hover:bg-primary/10',
  },
  {
    icon: Upload,
    label: 'Upload GL',
    href: '/ingestion',
    color: 'text-primary hover:bg-primary/10',
  },
  {
    icon: Calculator,
    label: 'Run reconciliation',
    href: '/reconciliations',
    color: 'text-primary hover:bg-primary/10',
  },
  {
    icon: TrendingUp,
    label: 'View Pricing',
    href: '/pricing',
    color: 'text-primary hover:bg-primary/10',
  },
]

export interface QuickActionsCardProps {
  /** Dashboard personalization tier */
  tier: DashboardTier
  /** Additional CSS classes */
  className?: string
}

function getActionsForTier(tier: DashboardTier) {
  if (tier === 'free') return freeActions
  return paidActions
}

export function QuickActionsCard({ tier, className }: QuickActionsCardProps) {
  const actions = getActionsForTier(tier)

  return (
    <Card className={cn('shadow-elevation-1', className)}>
      <CardHeader className="pb-3">
        <CardTitle as="h2" className="text-base font-medium">
          Quick Actions
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {actions.map((action) => (
            <Link
              key={action.label}
              to={action.href}
              className={cn(
                'flex min-w-0 items-center gap-3 rounded-full p-3 transition-colors duration-200',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                action.color
              )}
            >
              <action.icon className="h-5 w-5 shrink-0" aria-hidden="true" />
              <span className="min-w-0 break-words text-sm font-medium leading-5">
                {action.label}
              </span>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
