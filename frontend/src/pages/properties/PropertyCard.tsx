/**
 * Property Card Component
 *
 * Mobile-optimized card view for property data.
 * Used on mobile devices instead of the data table.
 */
import { Property } from '@/api/client'
import { Card, CardContent } from '@/components/ui/card'
import { MapPin, Square } from 'lucide-react'
import { formatTimestampDate } from '@/lib/utils'
import { formatWholeNumber } from '@/lib/number'

interface PropertyCardProps {
  property: Property
  onClick?: (property: Property) => void
}

/**
 * Format full address on one line
 */
function formatAddress(property: Property): string {
  const parts = [
    property.address_line1,
    property.address_line2,
    property.city,
    property.state,
    property.postal_code,
  ].filter(Boolean)
  return parts.join(', ')
}

export function PropertyCard({ property, onClick }: PropertyCardProps) {
  const formattedDate = formatTimestampDate(property.created_at)

  return (
    <Card
      data-testid="property-card"
      className="cursor-pointer shadow-sm transition-all duration-fast hover:bg-accent hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      onClick={() => onClick?.(property)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick?.(property)
        }
      }}
    >
      <CardContent className="p-4 space-y-3">
        {/* Property Name */}
        <div>
          <h3 className="font-semibold text-lg leading-none">
            {property.name}
          </h3>
        </div>

        {/* Address */}
        <div className="flex items-start gap-2">
          <MapPin
            className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0"
            aria-hidden="true"
          />
          <p className="text-sm text-muted-foreground">
            {formatAddress(property)}
          </p>
        </div>

        {/* Square Footage */}
        <div className="flex items-center gap-2">
          <Square
            className="h-4 w-4 text-muted-foreground flex-shrink-0"
            aria-hidden="true"
          />
          <div className="text-sm">
            <span className="font-mono">
              {formatWholeNumber(property.total_rentable_sqft)}
            </span>{' '}
            <span className="text-muted-foreground">rentable /</span>{' '}
            <span className="font-mono">
              {formatWholeNumber(property.total_usable_sqft)}
            </span>{' '}
            <span className="text-muted-foreground">usable sqft</span>
          </div>
        </div>

        {/* Created Date */}
        <div className="text-xs text-muted-foreground pt-1 border-t">
          Created {formattedDate}
        </div>
      </CardContent>
    </Card>
  )
}
