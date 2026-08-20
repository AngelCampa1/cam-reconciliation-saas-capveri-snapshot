/**
 * TaxProtestPage - dedicated page for managing tax protest deadlines and packages.
 *
 * Shows all org properties with their effective deadlines and urgency badges.
 * Links to property settings for configuration.
 */
import { Landmark, Settings } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useTaxProtestDeadlines } from '@/api/hooks'
import { PageHeader, PageContainer } from '@/components/layout'
import { ErrorState } from '@/components/ErrorState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { DataTableSkeleton } from '@/components/ui/data-table/DataTableSkeleton'
import { EmptyState } from '@/components/EmptyState'
import { urgencyVariant } from '@/features/tax-protest/lib/urgency'
import { useViewport } from '@/hooks/useViewport'

export function TaxProtestPage() {
  const { data, isLoading, isError, isPaused, refetch } =
    useTaxProtestDeadlines()
  const { isMobile } = useViewport()

  // A paused fetch (React Query networkMode pausing on an unreachable backend)
  // leaves isError false and data undefined, so without this the page would
  // fall through every branch below to a bare header over an empty void. The
  // `!data` guard matters: if a paused refetch still has stale data, keep
  // rendering the table rather than hiding it behind an offline screen.
  const isOffline = isPaused && !data

  return (
    <PageContainer>
      <PageHeader
        title="Tax Protest"
        description="Manage property tax protest deadlines and generate data packages."
      />

      {isLoading && (
        <div data-testid="deadlines-loading">
          <DataTableSkeleton columnCount={6} rowCount={4} />
        </div>
      )}

      {!isLoading && (isError || isOffline) && (
        <ErrorState
          data-testid="deadlines-error"
          title="Couldn't load deadlines"
          description="Something went wrong on our end."
          offline={isOffline}
          action={{ onClick: () => refetch() }}
        />
      )}

      {!isLoading && !isError && !isOffline && data?.items.length === 0 && (
        <EmptyState
          data-testid="deadlines-empty"
          icon={Landmark}
          title="No properties yet"
          description="Add a property to see tax protest deadlines here."
        />
      )}

      {!isLoading &&
        data &&
        data.items.length > 0 &&
        (isMobile ? (
          /* Mobile: stacked cards so Configure button never scrolls off-screen */
          <div className="space-y-3" data-testid="mobile-cards-view">
            {data.items.map((item) => (
              <div key={item.property_id} className="rounded-lg border p-4">
                <div className="flex items-start justify-between gap-3">
                  <span className="font-medium">{item.property_name}</span>
                  {item.is_configured ? (
                    <Badge
                      variant={urgencyVariant(
                        item.days_remaining,
                        item.is_past
                      )}
                    >
                      {item.is_past
                        ? 'Past'
                        : item.days_remaining === 0
                          ? 'Today'
                          : item.days_remaining !== null
                            ? `${item.days_remaining}d`
                            : '-'}
                    </Badge>
                  ) : (
                    <Badge variant="outline">Not configured</Badge>
                  )}
                </div>
                <div className="mt-3 space-y-1 text-sm text-muted-foreground">
                  <div>
                    <span className="font-medium text-foreground">
                      County:{' '}
                    </span>
                    {item.county ?? <span className="text-xs">Not set</span>}
                  </div>
                  <div>
                    <span className="font-medium text-foreground">State: </span>
                    {item.state ?? <span className="text-xs">Not set</span>}
                  </div>
                  <div>
                    <span className="font-medium text-foreground">
                      Deadline:{' '}
                    </span>
                    {item.effective_deadline ?? (
                      <span className="text-xs">-</span>
                    )}
                  </div>
                </div>
                <Button
                  asChild
                  variant="ghost"
                  size="sm"
                  className="mt-4 w-full min-h-[44px]"
                  data-testid={`configure-property-${item.property_id}`}
                >
                  <Link
                    to={`/properties/${item.property_id}/edit#tax-protest`}
                    className="gap-1"
                  >
                    <Settings className="h-3 w-3" aria-hidden="true" />
                    Configure
                  </Link>
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border" data-testid="desktop-table-view">
            <Table>
              <caption className="sr-only">
                Tax protest status by property
              </caption>
              <TableHeader>
                <TableRow>
                  <TableHead>Property</TableHead>
                  <TableHead>County</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>Deadline</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((item) => (
                  <TableRow key={item.property_id}>
                    <TableCell className="font-medium">
                      {item.property_name}
                    </TableCell>
                    <TableCell>
                      {item.county ?? (
                        <span className="text-muted-foreground text-xs">
                          Not set
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {item.state ?? (
                        <span className="text-muted-foreground text-xs">
                          Not set
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {item.effective_deadline ?? (
                        <span className="text-muted-foreground text-xs">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {item.is_configured ? (
                        <Badge
                          variant={urgencyVariant(
                            item.days_remaining,
                            item.is_past
                          )}
                        >
                          {item.is_past
                            ? 'Past'
                            : item.days_remaining === 0
                              ? 'Today'
                              : item.days_remaining !== null
                                ? `${item.days_remaining}d`
                                : '-'}
                        </Badge>
                      ) : (
                        <Badge variant="outline">Not configured</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        asChild
                        variant="ghost"
                        size="sm"
                        data-testid={`configure-property-${item.property_id}`}
                      >
                        <Link
                          to={`/properties/${item.property_id}/edit#tax-protest`}
                          className="gap-1"
                        >
                          <Settings className="h-3 w-3" aria-hidden="true" />
                          Configure
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ))}
    </PageContainer>
  )
}
