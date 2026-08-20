/**
 * Pools management page.
 *
 * Displays expense pool structures and allows copying pools between properties.
 */

import { useState } from 'react'
import { Building2, Copy, Layers3, Plus } from 'lucide-react'
import { useProperties } from '@/api/hooks'
import { PageContainer, PageHeader } from '@/components/layout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { EmptyState } from '@/components/EmptyState'
import { ErrorState } from '@/components/ErrorState'
import { StatCard } from '@/components/ui/stat-card'
import { SkeletonCard } from '@/components/ui/skeleton'
import { PoolCopyDialog } from '@/features/pools/components/PoolCopyDialog'
import { cn } from '@/lib/utils'

const INITIAL_PROPERTY_COUNT = 6

const COPY_DISABLED_REASON =
  'Add a second property to copy expense pools between properties.'

/**
 * "Copy pools" action that explains itself when unavailable.
 *
 * Copying pools requires at least two properties; with one (or none) the action
 * is disabled. A bare disabled button leaves the user guessing why they can't
 * click it, so when disabled we wrap it in a tooltip that states the reason and
 * the fix. A focusable span hosts the tooltip because disabled buttons receive
 * no pointer/focus events of their own.
 */
function CopyPoolsAction({
  disabled,
  onClick,
  label,
  className,
}: {
  disabled: boolean
  onClick: () => void
  label: string
  className?: string
}) {
  if (!disabled) {
    return (
      <Button onClick={onClick} className={className}>
        <Copy className="mr-2 h-4 w-4" aria-hidden="true" />
        {label}
      </Button>
    )
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn('inline-block', className)} tabIndex={0}>
          <Button disabled className="pointer-events-none w-full">
            <Copy className="mr-2 h-4 w-4" aria-hidden="true" />
            {label}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>{COPY_DISABLED_REASON}</TooltipContent>
    </Tooltip>
  )
}

export function PoolsPage() {
  const [copyDialogOpen, setCopyDialogOpen] = useState(false)
  const [showAllProperties, setShowAllProperties] = useState(false)

  const {
    data: propertiesResponse,
    isLoading: isPropertiesLoading,
    isError: isPropertiesError,
    isPaused: isPropertiesPaused,
    refetch: refetchProperties,
  } = useProperties()
  // A paused fetch (unreachable backend) is not an error and not an empty
  // account — without this the "No properties available" prompt below would lie.
  const isPropertiesOffline = isPropertiesPaused && !propertiesResponse
  const properties = (propertiesResponse?.data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
  }))

  const hasMoreProperties = properties.length > INITIAL_PROPERTY_COUNT
  const visibleProperties =
    showAllProperties || !hasMoreProperties
      ? properties
      : properties.slice(0, INITIAL_PROPERTY_COUNT)

  return (
    <PageContainer>
      <PageHeader
        title="Expense Pools"
        description="Manage expense pool structures across properties."
        actions={
          <CopyPoolsAction
            disabled={properties.length < 2}
            onClick={() => setCopyDialogOpen(true)}
            label="Copy Pools"
          />
        }
      />

      <div className="space-y-6">
        {isPropertiesLoading ? (
          <SkeletonCard className="sm:max-w-xs" bodyLines={1} />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:max-w-xs">
            <StatCard
              title="Properties Available"
              value={properties.length.toString()}
              icon={Building2}
              iconColor="chart-4"
              titleAs="h2"
            />
          </div>
        )}

        {isPropertiesLoading ? (
          <Card>
            <CardContent className="pt-6">
              <SkeletonCard bodyLines={6} />
            </CardContent>
          </Card>
        ) : isPropertiesError || isPropertiesOffline ? (
          <ErrorState
            title="Couldn't load properties"
            titleAs="h2"
            offline={isPropertiesOffline}
            action={{ onClick: () => refetchProperties() }}
          />
        ) : properties.length === 0 ? (
          <EmptyState
            icon={Layers3}
            title="No properties available"
            description="Create a property before setting up expense pools."
            action={{
              label: 'Add Property',
              onClick: () => {
                window.location.href = '/properties/new'
              },
            }}
          />
        ) : (
          <Card>
            <CardHeader>
              {/* F-296: section heading is an <h2> (not shadcn CardTitle's
                  hardcoded <h3>) so the page ladder is H1 -> H2 with no skip.
                  Classes reproduce CardTitle's base after the text-lg override. */}
              <h2 className="text-lg font-semibold leading-none tracking-tight">
                Start from a property
              </h2>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {visibleProperties.map((property) => (
                  <a
                    key={property.id}
                    href={`/properties/${property.id}#pools`}
                    className="rounded-lg border bg-card p-4 transition-colors hover:bg-muted/40 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <div className="flex items-center gap-3">
                      <div className="rounded-md bg-primary/10 p-2">
                        <Layers3
                          className="h-4 w-4 text-primary"
                          aria-hidden="true"
                        />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-medium">{property.name}</p>
                        <p className="text-sm text-muted-foreground">
                          Review or edit pools
                        </p>
                      </div>
                    </div>
                  </a>
                ))}
              </div>
              {hasMoreProperties && (
                <div
                  className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between"
                  data-testid="property-truncation-notice"
                >
                  <p className="text-sm text-muted-foreground">
                    {showAllProperties
                      ? `Showing all ${properties.length} properties.`
                      : `Showing ${visibleProperties.length} of ${properties.length} properties.`}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowAllProperties((prev) => !prev)}
                    data-testid="property-show-all-toggle"
                  >
                    {showAllProperties
                      ? 'Show fewer'
                      : `Show all (${properties.length})`}
                  </Button>
                </div>
              )}
              <div className="flex flex-col gap-2 sm:flex-row">
                <CopyPoolsAction
                  disabled={properties.length < 2}
                  onClick={() => setCopyDialogOpen(true)}
                  label="Copy Between Properties"
                  className="w-full sm:w-auto"
                />
                <Button asChild variant="outline" className="w-full sm:w-auto">
                  <a href="/properties/new">
                    <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                    Add Property
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <PoolCopyDialog
        open={copyDialogOpen}
        onOpenChange={setCopyDialogOpen}
        properties={properties}
      />
    </PageContainer>
  )
}
