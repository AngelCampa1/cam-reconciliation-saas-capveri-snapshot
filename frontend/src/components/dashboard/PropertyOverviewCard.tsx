/**
 * Property Overview Card Component
 *
 * Displays a summary of recent properties.
 */
import { Building2, ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { pluralizeWithCount } from '@/lib/pluralize'

export interface PropertySummary {
  id: string
  name: string
  unitCount: number
  lastReconciliation?: string
}

export interface PropertyOverviewCardProps {
  /** List of properties to display */
  properties: PropertySummary[]
  /** Additional CSS classes */
  className?: string
}

export function PropertyOverviewCard({
  properties,
  className,
}: PropertyOverviewCardProps) {
  const hasProperties = properties.length > 0

  return (
    <Card className={cn(className)}>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base font-medium">Properties</CardTitle>
        {hasProperties && (
          <Button asChild variant="ghost" size="sm">
            <Link to="/properties">
              View all
              <ArrowRight className="ml-1 h-3 w-3" />
            </Link>
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {hasProperties ? (
          <div className="space-y-3">
            {properties.slice(0, 5).map((property) => (
              <Link
                key={property.id}
                to={`/properties/${property.id}`}
                className="flex items-center gap-3 rounded-lg p-2 transition-colors duration-fast hover:bg-muted/50"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <Building2 className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 overflow-hidden">
                  <div className="truncate font-medium" title={property.name}>
                    {property.name}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {pluralizeWithCount(property.unitCount, 'unit')}
                    {property.lastReconciliation &&
                      ` • Last reconciled ${property.lastReconciliation}`}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Building2 className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="mb-4 text-sm text-muted-foreground">
              No properties yet
            </p>
            <Button asChild size="sm">
              <Link to="/properties/new">Add Property</Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
