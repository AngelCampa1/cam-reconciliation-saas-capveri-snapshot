/**
 * Property Overview Tab Component
 *
 * Displays property details including BOMA area information.
 */
import type { Property } from '@/api/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatWholeNumber } from '@/lib/number'
import { formatTimestampDate } from '@/lib/utils'

interface PropertyOverviewTabProps {
  property: Property
}

/**
 * Format decimal as percentage
 */
function formatPercent(decimal: string): string {
  const num = parseFloat(decimal)
  if (isNaN(num)) return decimal
  return `${(num * 100).toFixed(1)}%`
}

/**
 * Calculate load factor (R/U ratio)
 */
function calculateLoadFactor(rentable: string, usable: string): string {
  const r = parseFloat(rentable)
  const u = parseFloat(usable)
  if (isNaN(r) || isNaN(u) || u === 0) return 'N/A'
  const ratio = r / u
  return ratio.toFixed(2)
}

/**
 * Property detail row component
 */
interface DetailRowProps {
  label: string
  value: string | React.ReactNode
}

function DetailRow({ label, value }: DetailRowProps) {
  return (
    <div className="flex justify-between border-b py-3 last:border-0">
      <span className="font-medium text-muted-foreground">{label}</span>
      <span className="text-foreground">{value}</span>
    </div>
  )
}

export function PropertyOverviewTab({ property }: PropertyOverviewTabProps) {
  const loadFactor = calculateLoadFactor(
    property.total_rentable_sqft,
    property.total_usable_sqft
  )

  const createdDate = formatTimestampDate(property.created_at)
  const updatedDate = formatTimestampDate(property.updated_at)

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* BOMA Area Information */}
      <Card>
        <CardHeader>
          <CardTitle as="h2">BOMA Area Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-0">
          <DetailRow
            label="Total Rentable Sqft"
            value={formatWholeNumber(property.total_rentable_sqft)}
          />
          <DetailRow
            label="Total Usable Sqft"
            value={formatWholeNumber(property.total_usable_sqft)}
          />
          <DetailRow
            label="Common Area Sqft"
            value={formatWholeNumber(property.common_area_sqft)}
          />
          <DetailRow
            label="Load Factor (R/U Ratio)"
            value={<span className="font-mono text-sm">{loadFactor}</span>}
          />
          <DetailRow
            label="Target Occupancy"
            value={formatPercent(property.target_occupancy ?? '0.95')}
          />
        </CardContent>
      </Card>

      {/* Property Details */}
      <Card>
        <CardHeader>
          <CardTitle as="h2">Property Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-0">
          <DetailRow label="Address Line 1" value={property.address_line1} />
          {property.address_line2 && (
            <DetailRow label="Address Line 2" value={property.address_line2} />
          )}
          <DetailRow label="City" value={property.city} />
          <DetailRow label="State" value={property.state} />
          <DetailRow label="Postal Code" value={property.postal_code} />
        </CardContent>
      </Card>

      {/* Metadata */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle as="h2">Metadata</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2">
          <DetailRow label="Created" value={createdDate} />
          <DetailRow label="Last Updated" value={updatedDate} />
        </CardContent>
      </Card>
    </div>
  )
}
