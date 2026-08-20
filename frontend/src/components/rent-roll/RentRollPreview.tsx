/**
 * Rent Roll Preview Component
 *
 * Displays parsed rent roll data including property metadata,
 * units table, and summary statistics. Property metadata is editable
 * to allow user corrections before import.
 */
import { useState } from 'react'
import { useViewport } from '@/hooks/useViewport'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { formatNumber } from '@/lib/number'
import {
  Building2,
  MapPin,
  Users,
  Home,
  AlertTriangle,
  CheckCircle2,
  Pencil,
  Loader2,
} from 'lucide-react'
import type {
  RentRollPreviewResponse,
  RentRollPropertyMetadata,
} from '@/api/hooks'

interface RentRollPreviewProps {
  preview: RentRollPreviewResponse
  onConfirm: (overrides: Partial<RentRollPropertyMetadata>) => void
  onCancel: () => void
  isLoading?: boolean
}

const SOURCE_LABELS: Record<string, string> = {
  yardi_rent_roll: 'Yardi Voyager',
  mri_rent_roll: 'MRI Software',
  generic_rent_roll: 'Generic Format',
}

export function RentRollPreview({
  preview,
  onConfirm,
  onCancel,
  isLoading = false,
}: RentRollPreviewProps) {
  const [isEditing, setIsEditing] = useState(false)
  const { isMobile } = useViewport()
  const [metadata, setMetadata] = useState<Partial<RentRollPropertyMetadata>>({
    name: preview.property_metadata.name,
    address_line1: preview.property_metadata.address_line1,
    city: preview.property_metadata.city,
    state: preview.property_metadata.state,
    postal_code: preview.property_metadata.postal_code,
  })

  const handleConfirm = () => {
    onConfirm(metadata)
  }

  const sourceLabel =
    SOURCE_LABELS[preview.source_system] || preview.source_system

  return (
    <div className="space-y-6">
      {/* Source Detection Banner */}
      <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
        <div className="flex items-center gap-3">
          <Badge variant="secondary" className="text-sm">
            {sourceLabel}
          </Badge>
          <span className="text-sm text-muted-foreground">Detected format</span>
        </div>
        {preview.success ? (
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-success" />
            <span className="text-sm text-success-strong">
              Parsed successfully
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-destructive-strong">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-sm">Parse errors</span>
          </div>
        )}
      </div>

      {/* Errors */}
      {preview.errors.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <ul className="list-disc list-inside space-y-1">
              {preview.errors.map((error, i) => (
                <li key={i}>{error}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* Warnings */}
      {preview.warnings.length > 0 && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <ul className="list-disc list-inside space-y-1">
              {preview.warnings.map((warning, i) => (
                <li key={i}>{warning}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* Property Metadata */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Property Information
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            aria-expanded={isEditing}
            onClick={() => setIsEditing(!isEditing)}
          >
            <Pencil className="h-4 w-4 mr-2" />
            {isEditing ? 'Done Editing' : 'Edit'}
          </Button>
        </CardHeader>
        <CardContent>
          {isEditing ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="property-name">Property Name</Label>
                <Input
                  id="property-name"
                  value={metadata.name || ''}
                  onChange={(e) =>
                    setMetadata({ ...metadata, name: e.target.value })
                  }
                  placeholder="Enter property name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="address">Address</Label>
                <Input
                  id="address"
                  value={metadata.address_line1 || ''}
                  onChange={(e) =>
                    setMetadata({ ...metadata, address_line1: e.target.value })
                  }
                  placeholder="Enter address"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="city">City</Label>
                <Input
                  id="city"
                  value={metadata.city || ''}
                  onChange={(e) =>
                    setMetadata({ ...metadata, city: e.target.value })
                  }
                  placeholder="Enter city"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="state">State</Label>
                  <Input
                    id="state"
                    value={metadata.state || ''}
                    onChange={(e) =>
                      setMetadata({ ...metadata, state: e.target.value })
                    }
                    placeholder="TX"
                    maxLength={2}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="postal-code">ZIP Code</Label>
                  <Input
                    id="postal-code"
                    value={metadata.postal_code || ''}
                    onChange={(e) =>
                      setMetadata({ ...metadata, postal_code: e.target.value })
                    }
                    placeholder="12345"
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="flex items-start gap-3">
                <Building2 className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-sm text-muted-foreground">Property Name</p>
                  <p className="font-medium">
                    {metadata.name || 'Not detected'}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <MapPin className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-sm text-muted-foreground">Address</p>
                  <p
                    className="font-medium truncate max-w-xs"
                    title={
                      [
                        metadata.address_line1,
                        metadata.city,
                        metadata.state,
                        metadata.postal_code,
                      ]
                        .filter(Boolean)
                        .join(', ') || undefined
                    }
                  >
                    {[
                      metadata.address_line1,
                      metadata.city,
                      metadata.state,
                      metadata.postal_code,
                    ]
                      .filter(Boolean)
                      .join(', ') || 'Not detected'}
                  </p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Home className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{preview.total_units}</p>
                <p className="text-sm text-muted-foreground">Total Units</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-success/10 rounded-lg">
                <Users className="h-5 w-5 text-success" />
              </div>
              <div>
                <p className="text-2xl font-bold">{preview.occupied_units}</p>
                <p className="text-sm text-muted-foreground">Occupied Units</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-muted rounded-lg">
                <Home className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {preview.total_units - preview.occupied_units}
                </p>
                <p className="text-sm text-muted-foreground">Vacant Units</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Units Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Units Preview</CardTitle>
        </CardHeader>
        <CardContent>
          {isMobile ? (
            <div className="space-y-3 md:hidden">
              {preview.units.map((unit, index) => (
                <div
                  key={index}
                  className="rounded-lg border bg-background p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        Unit {unit.unit_number}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {formatNumber(parseFloat(unit.rentable_sqft))} RSF
                        {unit.floor ? ` · Floor ${unit.floor}` : ''}
                      </p>
                    </div>
                    <Badge variant={unit.tenant_name ? 'secondary' : 'outline'}>
                      {unit.tenant_name ? 'Occupied' : 'Vacant'}
                    </Badge>
                  </div>
                  <div className="mt-3">
                    <p className="text-xs text-muted-foreground">Tenant</p>
                    <p
                      className="truncate font-medium"
                      title={unit.tenant_name ?? undefined}
                    >
                      {unit.tenant_name || 'Vacant'}
                    </p>
                  </div>
                  {(unit.lease_start || unit.lease_end) && (
                    <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground">
                          Lease Start
                        </p>
                        <p className="font-medium">{unit.lease_start || '-'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">
                          Lease End
                        </p>
                        <p className="font-medium">{unit.lease_end || '-'}</p>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : null}
          <div
            className={
              isMobile
                ? 'hidden overflow-hidden rounded-lg border md:block'
                : 'overflow-hidden rounded-lg border'
            }
          >
            <div className="max-h-80 overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-background">
                  <TableRow>
                    <TableHead>Unit</TableHead>
                    <TableHead className="text-right">RSF</TableHead>
                    <TableHead>Floor</TableHead>
                    <TableHead>Tenant</TableHead>
                    <TableHead>Lease Start</TableHead>
                    <TableHead>Lease End</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.units.map((unit, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-medium">
                        {unit.unit_number}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatNumber(parseFloat(unit.rentable_sqft))}
                      </TableCell>
                      <TableCell>{unit.floor || '-'}</TableCell>
                      <TableCell className="max-w-0 w-[200px]">
                        {unit.tenant_name ? (
                          <span
                            className="text-foreground block truncate max-w-[200px]"
                            title={unit.tenant_name}
                          >
                            {unit.tenant_name}
                          </span>
                        ) : (
                          <span className="text-muted-foreground italic">
                            Vacant
                          </span>
                        )}
                      </TableCell>
                      <TableCell>{unit.lease_start || '-'}</TableCell>
                      <TableCell>{unit.lease_end || '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
          {preview.units.length > 10 && (
            <p className="text-sm text-muted-foreground mt-2 text-center">
              Showing all {preview.units.length} units
            </p>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex items-center justify-end gap-3">
        <Button variant="outline" onClick={onCancel} disabled={isLoading}>
          Cancel
        </Button>
        <Button
          onClick={handleConfirm}
          disabled={isLoading || !preview.success}
          className={cn(!preview.success && 'opacity-50')}
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Importing…
            </>
          ) : (
            'Import Property'
          )}
        </Button>
      </div>
    </div>
  )
}
