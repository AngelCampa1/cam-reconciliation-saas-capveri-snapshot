/**
 * Alerts Card Component
 *
 * Displays actionable notifications and alerts.
 */
import { AlertTriangle, FileText, Calendar, ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { AllClearState } from './AllClearState'
import type { LucideIcon } from 'lucide-react'

export interface AlertItem {
  id: string
  type: 'warning' | 'info' | 'action'
  title: string
  description: string
  href: string
  count?: number
}

const alertIcons: Record<AlertItem['type'], LucideIcon> = {
  warning: AlertTriangle,
  info: Calendar,
  action: FileText,
}

const alertColors: Record<AlertItem['type'], string> = {
  warning: 'bg-warning/10 text-warning',
  info: 'bg-primary/10 text-primary',
  action: 'bg-primary/10 text-primary',
}

const alertBadgeColors: Record<AlertItem['type'], string> = {
  warning: 'bg-warning',
  info: 'bg-primary',
  action: 'bg-primary',
}

export interface AlertsCardProps {
  /** List of alert items */
  alerts: AlertItem[]
  /** Additional CSS classes */
  className?: string
}

export function AlertsCard({ alerts, className }: AlertsCardProps) {
  const hasAlerts = alerts.length > 0

  return (
    <Card className={cn(className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium">Action Items</CardTitle>
          {hasAlerts && (
            <Badge variant="secondary" className="h-5 px-2 text-xs">
              {alerts.length}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {hasAlerts ? (
          <div className="space-y-3">
            {alerts.map((alert) => {
              const Icon = alertIcons[alert.type]
              const colorClass = alertColors[alert.type]
              const badgeColor = alertBadgeColors[alert.type]

              return (
                <Link
                  key={alert.id}
                  to={alert.href}
                  className="flex items-start gap-3 rounded-lg border p-3 shadow-sm transition-colors duration-fast hover:bg-muted/50 hover:shadow-sm"
                >
                  <div
                    className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-lg',
                      colorClass
                    )}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{alert.title}</span>
                      {alert.count !== undefined && (
                        <Badge
                          className={cn(
                            'h-5 px-1.5 text-xs text-background',
                            badgeColor
                          )}
                        >
                          {alert.count}
                        </Badge>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {alert.description}
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </Link>
              )
            })}
          </div>
        ) : (
          <AllClearState message="All caught up! No pending actions." />
        )}
      </CardContent>
    </Card>
  )
}
