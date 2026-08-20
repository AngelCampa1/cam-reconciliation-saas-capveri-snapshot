/**
 * FormatCard component.
 *
 * Displays a selectable card for an export format with icon, name, and description.
 */

import { Building, Building2, FileSpreadsheet, FileText } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { FormatMetadata } from '../types'

interface FormatCardProps {
  format: FormatMetadata
  selected: boolean
  onClick: () => void
}

const iconMap = {
  FileText,
  FileSpreadsheet,
  Building2,
  Building,
}

export function FormatCard({ format, selected, onClick }: FormatCardProps) {
  const IconComponent = iconMap[format.icon as keyof typeof iconMap] || FileText

  return (
    <Card
      className={cn(
        'cursor-pointer shadow-sm transition-all duration-fast hover:shadow-sm',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        selected && 'border-primary ring-2 ring-primary ring-offset-2 shadow-sm'
      )}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick?.()
        }
      }}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'flex h-10 w-10 items-center justify-center rounded-lg',
              selected ? 'bg-primary text-primary-foreground' : 'bg-muted'
            )}
          >
            <IconComponent className="h-5 w-5" />
          </div>
          <CardTitle className="text-base">{format.name}</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <CardDescription className="text-sm">
          {format.description}
        </CardDescription>
      </CardContent>
    </Card>
  )
}
