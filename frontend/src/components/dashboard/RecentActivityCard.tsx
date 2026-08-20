/**
 * Recent Activity Card Component
 *
 * Displays a timeline of recent events.
 */
import {
  Upload,
  FileCheck,
  Calculator,
  Download,
  Building2,
  FileText,
  Clock,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/EmptyState'
import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

export interface ActivityItem {
  id: string
  type:
    | 'upload'
    | 'verification'
    | 'reconciliation'
    | 'export'
    | 'property'
    | 'lease'
  title: string
  description: string
  timestamp: string
}

const activityIcons: Record<ActivityItem['type'], LucideIcon> = {
  upload: Upload,
  verification: FileCheck,
  reconciliation: Calculator,
  export: Download,
  property: Building2,
  lease: FileText,
}

const activityColors: Record<ActivityItem['type'], string> = {
  upload: 'bg-success/10 text-success-strong',
  verification: 'bg-primary/10 text-primary',
  reconciliation: 'bg-secondary/10 text-secondary',
  export: 'bg-warning/10 text-warning-foreground',
  property: 'bg-muted text-muted-foreground',
  lease: 'bg-info/10 text-info-strong',
}

export interface RecentActivityCardProps {
  /** List of activity items */
  activities: ActivityItem[]
  /** Additional CSS classes */
  className?: string
}

export function RecentActivityCard({
  activities,
  className,
}: RecentActivityCardProps) {
  const hasActivities = activities.length > 0

  return (
    <Card className={cn(className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-medium">Recent Activity</CardTitle>
      </CardHeader>
      <CardContent>
        {hasActivities ? (
          <div className="space-y-4">
            {activities.slice(0, 10).map((activity, index) => {
              const Icon = activityIcons[activity.type]
              const colorClass = activityColors[activity.type]

              return (
                <div key={activity.id} className="flex gap-3">
                  {/* Timeline connector */}
                  <div className="flex flex-col items-center">
                    <div
                      className={cn(
                        'flex h-8 w-8 items-center justify-center rounded-full',
                        colorClass
                      )}
                    >
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </div>
                    {index < activities.length - 1 && (
                      <div className="mt-1 h-full w-0.5 bg-border" />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 pb-4">
                    <div
                      className="truncate font-medium"
                      title={activity.title}
                    >
                      {activity.title}
                    </div>
                    <div
                      className="line-clamp-2 text-sm text-muted-foreground"
                      title={activity.description}
                    >
                      {activity.description}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {activity.timestamp}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <EmptyState
            icon={Clock}
            title="No recent activity"
            description="Your latest actions show up here."
            size="sm"
          />
        )}
      </CardContent>
    </Card>
  )
}
