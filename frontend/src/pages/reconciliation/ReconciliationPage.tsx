/**
 * ReconciliationPage Component
 *
 * Main page for CAM reconciliation. Displays property-level reconciliation
 * data with virtualized grid, calculation tools, and finalization workflow.
 *
 * Epic 12: Production Integration
 */

import { useState, useMemo, useCallback, useEffect } from 'react'
import { useParams, useSearchParams, useNavigate, Link } from 'react-router-dom'
import { trackEvent } from '@/lib/analytics'
import {
  AlertCircle,
  Download,
  FileBarChart,
  MoreHorizontal,
  Send,
  TrendingUp,
} from 'lucide-react'
import { HelpButton } from '@/components/help/HelpButton'
import { ReconciliationWorkflowTourSheet } from '@/components/help/ReconciliationWorkflowTourSheet'
import {
  GuidedEmptyState,
  GuideCallout,
  HelpTerm,
  HelpTip,
} from '@/features/help/components'
import { MissingMappingsWarning } from '@/features/reconciliation/components/MissingMappingsWarning'
import { FreeAuditUpgradeModal } from '@/components/billing/FreeAuditUpgradeModal'
import { useSubscription } from '@/hooks/use-subscription'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/layout/PageHeader'
import { PageContainer } from '@/components/layout'
import { SkeletonCard } from '@/components/ui/skeleton'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

import { ReconciliationHeader } from './components/ReconciliationHeader'
import { ReconciliationMobileView } from './components/ReconciliationMobileView'
import { useReconciliationData, useLatestGLPeriod } from './hooks'
import { GLAnalysisPanel } from '@/features/analysis/components/GLAnalysisPanel'
import {
  useReconciliationSnapshot,
  useCampaigns,
  useSubmitForReview,
} from '@/api'
import { useViewport } from '@/hooks/useViewport'

import {
  ReconciliationGrid,
  CalculateButton,
  FinalizeButton,
  ColumnConfigMenu,
  CalculationTraceDrawer,
  ReconciliationWorkflowStepper,
  ExportButton,
  ExportPanel,
  DemandLetterPanel,
  VarianceReport,
  DenominatorChangePanel,
  NOIImpactPanel,
  TenantSummary,
  reconciliationColumns,
} from '@/features/reconciliation/components'
import type { TenantSummaryData } from '@/features/reconciliation/components'

import {
  useColumnConfig,
  useReconciliationValidation,
} from '@/features/reconciliation/hooks'
import { isTenantSummaryRow } from '@/features/reconciliation/types/reconciliation-row'
import { Badge } from '@/components/ui/badge'
import { CampaignStatus } from '@/types/enums'
import {
  CAMPAIGN_STATUS_LABELS,
  CAMPAIGN_STATUS_VARIANTS,
} from '@/lib/campaign-status'
import { toast } from 'sonner'
import type { CalculationStep } from '@/types/calculation-step'
import type { SnapshotSummary } from '@/features/reconciliation/components/FinalizeModal'
import { TaxProtestPanel } from '@/features/tax-protest/components/TaxProtestPanel'

/**
 * Loading skeleton for ReconciliationPage.
 */
function ReconciliationPageSkeleton() {
  return (
    <PageContainer>
      <div className="space-y-4">
        <SkeletonCard className="h-12" bodyLines={0} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SkeletonCard className="h-28" bodyLines={0} />
          <SkeletonCard className="h-28" bodyLines={0} />
          <SkeletonCard className="h-28" bodyLines={0} />
          <SkeletonCard className="h-28" bodyLines={0} />
        </div>
        <SkeletonCard bodyLines={6} />
      </div>
    </PageContainer>
  )
}

/**
 * Error state for ReconciliationPage.
 */
function ReconciliationPageError({
  error,
  propertyId,
  property,
  offline = false,
  onRetry,
}: {
  error: Error | null
  propertyId?: string | undefined
  property?: { id: string; name: string } | null | undefined
  offline?: boolean
  onRetry?: () => void
}) {
  if (error) console.error(error)
  return (
    <div className="flex min-h-screen flex-col px-4 py-6 md:px-6 lg:px-8">
      <PageHeader
        title="Reconciliation Error"
        showBackButton={true}
        backButtonTo={propertyId ? `/properties/${propertyId}` : '/properties'}
        breadcrumbs={
          property
            ? [
                { label: 'Properties', href: '/properties' },
                { label: property.name, href: `/properties/${propertyId}` },
                { label: 'Reconciliation' },
              ]
            : [
                { label: 'Properties', href: '/properties' },
                { label: 'Reconciliation' },
              ]
        }
      />
      <div className="flex flex-1 items-center justify-center">
        <Alert variant="destructive" className="max-w-2xl">
          <AlertCircle className="h-4 w-4" aria-hidden="true" />
          <AlertTitle>
            {offline
              ? "Can't reach the server"
              : 'Error Loading Reconciliation'}
          </AlertTitle>
          <AlertDescription className="space-y-3">
            <p>
              {offline
                ? 'Check your connection and try again. Your data is safe.'
                : "We couldn't load this reconciliation. Your data is safe. Go back and open it again."}
            </p>
            <div className="flex flex-wrap gap-2">
              {offline && onRetry && (
                <Button variant="outline" size="sm" onClick={onRetry}>
                  Try again
                </Button>
              )}
              <Button asChild variant="outline" size="sm">
                <Link to="/properties">Back to properties</Link>
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      </div>
    </div>
  )
}

/**
 * Empty state for ReconciliationPage.
 */
function ReconciliationEmptyState({
  propertyId,
  property,
  year,
}: {
  propertyId: string
  property: { id: string; name: string }
  year: string
}) {
  return (
    <div className="flex min-h-screen flex-col px-4 py-6 md:px-6 lg:px-8">
      <PageHeader
        title={`${property.name} - ${year} Reconciliation`}
        showBackButton={true}
        backButtonTo={`/properties/${propertyId}`}
        breadcrumbs={[
          { label: 'Properties', href: '/properties' },
          { label: property.name, href: `/properties/${propertyId}` },
          { label: `${year} Reconciliation` },
        ]}
      />
      <div className="py-8">
        <GuidedEmptyState
          title="No reconciliation yet"
          description="CapVeri needs expense data, lease terms, and pool mappings first. Then it can calculate tenant totals."
          nextActionLabel="Upload GL data"
          nextActionHref="/ingestion"
        >
          <p className="text-sm text-muted-foreground">
            No reconciliation snapshots found.
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            After upload, return here to calculate, review warnings, and
            finalize tenant packets.
          </p>
        </GuidedEmptyState>
      </div>
    </div>
  )
}

/**
 * Main ReconciliationPage component.
 *
 * URL Structure: /properties/:propertyId/reconciliations?year=2024
 *
 * Features:
 * - Property header with summary statistics
 * - Virtualized reconciliation grid with 1000+ row support
 * - Calculate button (trigger reconciliation calculation)
 * - Finalize button (lock snapshots)
 * - Column configuration menu
 * - Calculation trace drawer (audit trail)
 * - Loading, error, and empty states
 * - Responsive layout (mobile, tablet, desktop)
 */
export function ReconciliationPage() {
  const { propertyId } = useParams<{ propertyId: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  useEffect(() => {
    trackEvent('reconciliation_page_viewed', {
      ...(propertyId ? { property_id: propertyId } : {}),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Infer year from GL data instead of defaulting to current year
  const { data: latestGLYear, isLoading: loadingGLYear } = useLatestGLPeriod(
    propertyId!
  )

  const yearFromParam = searchParams.get('year')
  const inferredYear =
    latestGLYear?.toString() ?? new Date().getFullYear().toString()
  const year = yearFromParam || inferredYear

  // Responsive breakpoint detection
  const { isMobile } = useViewport()

  // Data fetching
  const {
    rows,
    snapshots,
    property,
    isFinalized,
    totalRecovery,
    tenantCount,
    isLoading,
    isError,
    isPaused,
    error,
    refetch,
  } = useReconciliationData({
    propertyId: propertyId!,
    year,
  })

  // A paused fetch (unreachable backend) leaves data undefined without an
  // error — surface it as offline instead of a misleading "Property not found".
  const isOffline = isPaused && !property

  // Campaign data for this property + year (non-blocking; campaigns endpoint
  // may 404 in production if the feature isn't fully deployed yet)
  const { data: campaigns } = useCampaigns({
    year: Number(year),
    throwOnError: false,
  })
  const campaign = useMemo(
    () => campaigns?.find((c) => c.property_id === propertyId),
    [campaigns, propertyId]
  )
  const submitForReview = useSubmitForReview()

  const handleSubmitForReview = useCallback(async () => {
    if (!campaign) return
    try {
      await submitForReview.mutateAsync(campaign.id)
      toast.success('Campaign submitted for review')
    } catch {
      toast.error('Failed to submit for review')
    }
  }, [campaign, submitForReview])

  // Column configuration (desktop only)
  const { columnVisibility, toggleColumn, resetToDefaults } = useColumnConfig()

  // Pre-flight validation for calculation
  const { pools, unmappedPools, mappingCounts } = useReconciliationValidation(
    propertyId!
  )

  // Help tour state
  const [isHelpOpen, setIsHelpOpen] = useState(false)

  // Handler to navigate to Pools tab for fixing mappings.
  // PropertyDetailPage selects its active tab from the URL *hash* (see
  // tabFromHash), not a ?tab= query param, so the target must be `#pools`.
  const handleFixMappings = useCallback(() => {
    navigate(`/properties/${propertyId}#pools`)
  }, [navigate, propertyId])

  // Subscription status for free audit upgrade modal
  const { data: subscription } = useSubscription()
  const hasSubscription =
    subscription?.status === 'active' || subscription?.status === 'trialing'
  const hasNoiBoardAccess = hasSubscription

  // Free audit upgrade modal state
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false)
  const [upgradeModalRecovery, setUpgradeModalRecovery] = useState<
    number | null
  >(null)

  // Tenant summary side panel state
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null)
  const [isTenantSummaryCollapsed, setIsTenantSummaryCollapsed] =
    useState(false)

  const handleFreeAuditComplete = useCallback(
    (recoveryTotal: number | null) => {
      if (hasSubscription) return
      // Only show once per org (persist seen flag in localStorage)
      const seenKey = 'free_audit_upgrade_modal_seen'
      if (localStorage.getItem(seenKey)) return
      localStorage.setItem(seenKey, '1')
      setUpgradeModalRecovery(recoveryTotal)
      setUpgradeModalOpen(true)
    },
    [hasSubscription]
  )

  // Variance export panel state
  const [exportOpen, setExportOpen] = useState(false)
  const [exportDefaultTab, setExportDefaultTab] = useState('pdf')
  const [demandLetterOpen, setDemandLetterOpen] = useState(false)
  const [taxProtestOpen, setTaxProtestOpen] = useState(false)

  // Calculation trace drawer. selectedSnapshotId drives open/close state
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(
    null
  )

  // Fetch full snapshot detail when user clicks trace (includes calculation_trace)
  const { data: traceSnapshot } = useReconciliationSnapshot(
    selectedSnapshotId ?? '',
    true,
    { enabled: !!selectedSnapshotId }
  )

  // Derive trace drawer props from fetched snapshot (no intermediate state needed)
  const traceDrawerOpen = !!selectedSnapshotId
  const traceData = useMemo(
    () =>
      (traceSnapshot?.calculation_trace ?? []) as unknown as CalculationStep[],
    [traceSnapshot]
  )
  const traceFinalValue = traceSnapshot?.total_recovery ?? '0.00'
  const traceTermsNote = useMemo(() => {
    const note = traceSnapshot?.lease_terms_snapshot?.estimated_terms_note
    return typeof note === 'string' && note.trim() ? note : undefined
  }, [traceSnapshot])
  const traceTenantName = useMemo(
    () =>
      snapshots.find((s) => s.id === selectedSnapshotId)?.tenant_name ??
      undefined,
    [snapshots, selectedSnapshotId]
  )
  const tracePoolName = undefined

  // Handler to open calculation trace drawer for a tenant row
  const handleTrace = useCallback(
    (
      row: import('@/features/reconciliation/types/reconciliation-row').ReconciliationRow
    ) => {
      if (row.type !== 'tenant_summary') return
      const snapshot = snapshots.find((s) => s.lease_id === row.tenant_id)
      if (snapshot) {
        trackEvent('calculation_trace_opened', {
          property_id: propertyId,
          snapshot_id: snapshot.id,
          tenant_id: row.tenant_id,
          year,
        })
        setSelectedSnapshotId(snapshot.id)
      }
    },
    [propertyId, snapshots, year]
  )

  // Use unified column definitions for grid
  const columns = useMemo(() => {
    return reconciliationColumns
  }, [])

  // Create column config for ColumnConfigMenu
  const columnConfig = useMemo(() => {
    return columns.map((col) => ({
      id:
        (col.id as string) ||
        ('accessorKey' in col ? String(col.accessorKey) : 'unknown'),
      label:
        typeof col.header === 'string'
          ? col.header
          : 'accessorKey' in col
            ? String(col.accessorKey)
            : 'Unknown',
    }))
  }, [columns])

  // Period range for API calls
  const periodStart = `${year}-01-01`
  const periodEnd = `${year}-12-31`

  // Create snapshot summary for FinalizeButton
  const snapshotSummary: SnapshotSummary = useMemo(
    () => ({
      period: year,
      tenantCount,
      totalBillable: totalRecovery,
    }),
    [year, tenantCount, totalRecovery]
  )

  const visibleRows = useMemo(() => {
    if (!selectedTenantId) return rows

    return rows.filter((row) => {
      if (row.type === 'tenant_summary') {
        return row.tenant_id === selectedTenantId
      }
      return true
    })
  }, [rows, selectedTenantId])

  const tenantSummaryData: TenantSummaryData[] = useMemo(() => {
    const tenantRows = rows.filter(isTenantSummaryRow)
    const grandTotal = tenantRows.reduce(
      (sum, r) => sum + Number(r.total_recovery),
      0
    )
    return tenantRows.map((r) => ({
      id: r.tenant_id,
      name: r.tenant_name,
      proRataShare: grandTotal > 0 ? Number(r.total_recovery) / grandTotal : 0,
      totalBillable: Number(r.total_recovery),
    }))
  }, [rows])

  const demandLetterTenants = useMemo(
    () =>
      rows.filter(isTenantSummaryRow).map((r) => {
        const snap = snapshots.find((s) => s.lease_id === r.tenant_id)
        return {
          id: snap?.id ?? r.tenant_id,
          name: r.tenant_name,
          unit: '',
          total_recovery: Number(r.total_recovery ?? 0),
        }
      }),
    [rows, snapshots]
  )

  // Show loading while inferring year (only if no year param provided)
  if (!yearFromParam && loadingGLYear) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="mb-2 text-sm text-muted-foreground">
            Loading reconciliation data...
          </div>
        </div>
      </div>
    )
  }

  // Loading state
  if (isLoading) {
    return <ReconciliationPageSkeleton />
  }

  // Error state (includes a paused/unreachable backend)
  if (isError || isOffline) {
    return (
      <ReconciliationPageError
        error={error}
        propertyId={propertyId}
        property={property}
        offline={isOffline}
        onRetry={refetch}
      />
    )
  }

  // Not found state (property doesn't exist)
  if (!property) {
    return (
      <ReconciliationPageError
        error={new Error('Property not found')}
        propertyId={propertyId}
      />
    )
  }

  // Empty state (no reconciliation data)
  if (rows.length === 0) {
    return (
      <>
        <ReconciliationEmptyState
          propertyId={propertyId!}
          property={property}
          year={year}
        />
        <FreeAuditUpgradeModal
          open={upgradeModalOpen}
          potentialRecovery={upgradeModalRecovery}
          onClose={() => setUpgradeModalOpen(false)}
          onSubscribe={() => {
            setUpgradeModalOpen(false)
            navigate('/settings/billing')
          }}
        />
      </>
    )
  }

  return (
    <div className="flex min-h-screen flex-col px-4 py-6 md:px-6 lg:px-8">
      {/* Free Audit Upgrade Modal */}
      <FreeAuditUpgradeModal
        open={upgradeModalOpen}
        potentialRecovery={upgradeModalRecovery}
        onClose={() => setUpgradeModalOpen(false)}
        onSubscribe={() => {
          setUpgradeModalOpen(false)
          navigate('/settings/billing')
        }}
      />

      {/* Page Header with Navigation */}
      <PageHeader
        title={`${property.name} - ${year} Reconciliation`}
        showBackButton={true}
        backButtonTo={`/properties/${propertyId}`}
        breadcrumbs={[
          { label: 'Properties', href: '/properties' },
          { label: property.name, href: `/properties/${propertyId}` },
          { label: `${year} Reconciliation` },
        ]}
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <HelpButton onClick={() => setIsHelpOpen(true)} />
            {campaign && (
              <span className="inline-flex items-center gap-1">
                <Badge
                  variant={CAMPAIGN_STATUS_VARIANTS[campaign.status]}
                  data-testid="campaign-status-badge"
                >
                  {CAMPAIGN_STATUS_LABELS[campaign.status]}
                </Badge>
                <HelpTip
                  label="Campaign status"
                  className="hidden sm:inline-flex"
                >
                  Shows where this reconciliation is in the review and tenant
                  communication workflow.
                </HelpTip>
              </span>
            )}
            <CalculateButton
              propertyId={propertyId!}
              periodStart={periodStart}
              periodEnd={periodEnd}
              hasDraftData={!isFinalized}
              disabled={isFinalized}
              unmappedPools={unmappedPools}
              onFixMappings={handleFixMappings}
              onFreeAuditComplete={handleFreeAuditComplete}
            />
            <HelpTip label="Calculate" className="hidden sm:inline-flex">
              Runs deterministic CAM math using the uploaded GL, approved lease
              terms, and pool mappings. Fix warnings first when possible.
            </HelpTip>
            <FinalizeButton
              hasDraftData={!isFinalized}
              snapshot={snapshotSummary}
              propertyId={propertyId!}
              periodStart={periodStart}
              periodEnd={periodEnd}
              disabled={isFinalized}
            />
            <HelpTip label="Finalize" className="hidden sm:inline-flex">
              Locks the reviewed reconciliation so exports and tenant packets
              use a stable snapshot.
            </HelpTip>
            <ExportButton
              propertyId={propertyId!}
              year={Number(year)}
              tenants={rows.filter(isTenantSummaryRow).map((r) => ({
                id: r.tenant_id,
                name: r.tenant_name,
                unit: '',
              }))}
              isBoardLocked={!hasNoiBoardAccess}
              onUpgradeBoard={() => navigate('/settings/billing')}
            />
            <HelpTip label="Export" className="hidden sm:inline-flex">
              Creates tenant-ready files from the reconciliation data. Export
              after reviewing warnings and finalizing when possible.
            </HelpTip>
            {campaign?.status === CampaignStatus.FINALIZED && isFinalized && (
              <Button
                size="sm"
                onClick={handleSubmitForReview}
                disabled={submitForReview.isPending}
                data-testid="submit-for-review-button"
              >
                <Send className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                Submit for Review
              </Button>
            )}
            {!isMobile && (
              <ColumnConfigMenu
                columns={columnConfig}
                columnVisibility={columnVisibility}
                onVisibilityChange={toggleColumn}
                onReset={resetToDefaults}
              />
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 rounded-full"
                >
                  <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                  More
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem
                  data-testid="variance-report-button"
                  onSelect={() => {
                    trackEvent('variance_report_opened', {
                      property_id: propertyId,
                      year: Number(year),
                      source: 'toolbar',
                    })
                    setExportDefaultTab('variance')
                    setExportOpen(true)
                  }}
                >
                  <TrendingUp className="mr-2 h-4 w-4" aria-hidden="true" />
                  Statement Check Report
                </DropdownMenuItem>
                <DropdownMenuItem
                  data-testid="demand-letter-button"
                  disabled={!isFinalized || demandLetterTenants.length === 0}
                  className="items-start"
                  onSelect={() => {
                    trackEvent('demand_letter_panel_opened', {
                      property_id: propertyId,
                      year: Number(year),
                      tenant_count: demandLetterTenants.length,
                    })
                    setDemandLetterOpen(true)
                  }}
                >
                  <Download
                    className="mr-2 mt-0.5 h-4 w-4 shrink-0"
                    aria-hidden="true"
                  />
                  <div className="flex flex-col">
                    <span>Demand Letter</span>
                    {(!isFinalized || demandLetterTenants.length === 0) && (
                      <span className="text-xs text-muted-foreground">
                        {!isFinalized
                          ? 'Finalize the reconciliation first'
                          : 'Use the statement check report instead'}
                      </span>
                    )}
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem
                  data-testid="tax-protest-button"
                  disabled={!isFinalized || snapshots.length === 0}
                  className="items-start"
                  onSelect={() => setTaxProtestOpen(true)}
                >
                  <FileBarChart
                    className="mr-2 mt-0.5 h-4 w-4 shrink-0"
                    aria-hidden="true"
                  />
                  <div className="flex flex-col">
                    <span>Tax Protest</span>
                    {(!isFinalized || snapshots.length === 0) && (
                      <span className="text-xs text-muted-foreground">
                        {!isFinalized
                          ? 'Finalize the reconciliation first'
                          : 'No finalized snapshot yet'}
                      </span>
                    )}
                  </div>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        }
      />

      <ReconciliationWorkflowStepper
        propertyId={propertyId!}
        currentStep={
          isFinalized ? 'finalize' : rows.length > 0 ? 'review' : 'calculate'
        }
        completedSteps={
          isFinalized
            ? ['upload', 'calculate', 'review', 'finalize']
            : rows.length > 0
              ? ['upload', 'calculate']
              : ['upload']
        }
        className="mb-3"
      />

      {/* Missing mappings warning */}
      {unmappedPools.length > 0 && (
        <MissingMappingsWarning
          pools={pools}
          mappingCounts={mappingCounts}
          onNavigateToPools={handleFixMappings}
          onShowHelp={() => setIsHelpOpen(true)}
          isFinalized={isFinalized}
          className="mb-4"
        />
      )}

      {/* GL Narrative Analysis Panel (advisory, pre-finalization) */}
      {!isFinalized && unmappedPools.length === 0 && propertyId && year && (
        <GLAnalysisPanel
          propertyId={propertyId}
          periodYear={Number(year)}
          className="mb-4"
        />
      )}

      {/* Summary Statistics Header */}
      <ReconciliationHeader
        property={property}
        year={year}
        totalTenants={tenantCount}
        totalRecovery={totalRecovery}
        isFinalized={isFinalized}
      />

      {/* NOI Impact Panel (finalized reconciliations only) */}
      {isFinalized && (
        <div className="mb-3">
          <NOIImpactPanel
            propertyId={propertyId!}
            year={Number(year)}
            totalRecovery={totalRecovery}
            isLocked={!hasNoiBoardAccess}
            onUpgrade={() => navigate('/settings/billing')}
          />
        </div>
      )}

      <GuideCallout title="Review before tenant packets">
        <p>
          Check{' '}
          <HelpTerm term="variance" tipClassName="hidden sm:inline-flex">
            variance
          </HelpTerm>
          , denominator changes, tenant totals, and traces{' '}
          {isFinalized ? 'before you send tenant packets' : 'before finalizing'}
          .
        </p>
      </GuideCallout>

      <div className="mb-3 mt-3 flex flex-wrap gap-2">
        <VarianceReport propertyId={propertyId!} year={Number(year)} />
        <DenominatorChangePanel propertyId={propertyId!} year={Number(year)} />
      </div>

      {/* Responsive View: Mobile cards or Desktop grid + Tenant Summary side panel */}
      <div className="flex-1 overflow-hidden flex">
        {isMobile ? (
          <ReconciliationMobileView
            data={rows}
            isLoading={false}
            testId="reconciliation-mobile-view"
          />
        ) : (
          <>
            <div className="flex-1 overflow-hidden">
              <ReconciliationGrid
                data={visibleRows}
                columns={columns}
                isLoading={false}
                columnVisibility={columnVisibility}
                isFinalized={isFinalized}
                onTrace={handleTrace}
              />
            </div>
            <TenantSummary
              tenants={tenantSummaryData}
              onTenantSelect={setSelectedTenantId}
              selectedTenantId={selectedTenantId}
              isCollapsed={isTenantSummaryCollapsed}
              onToggleCollapse={() =>
                setIsTenantSummaryCollapsed((prev) => !prev)
              }
            />
          </>
        )}
      </div>

      {/* Calculation Trace Drawer */}
      <CalculationTraceDrawer
        isOpen={traceDrawerOpen}
        onClose={() => setSelectedSnapshotId(null)}
        steps={traceData}
        finalValue={traceFinalValue}
        tenantName={traceTenantName}
        poolName={tracePoolName}
        termsNote={traceTermsNote}
      />

      {/* Standalone ExportPanel for variance toolbar button */}
      <ExportPanel
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        propertyId={propertyId!}
        year={Number(year)}
        tenants={rows.filter(isTenantSummaryRow).map((r) => ({
          id: r.tenant_id,
          name: r.tenant_name,
          unit: '',
        }))}
        defaultTab={exportDefaultTab}
        isBoardLocked={!hasNoiBoardAccess}
        onUpgradeBoard={() => navigate('/settings/billing')}
      />

      <DemandLetterPanel
        open={demandLetterOpen}
        onClose={() => setDemandLetterOpen(false)}
        propertyId={propertyId!}
        year={Number(year)}
        tenants={demandLetterTenants}
      />

      <TaxProtestPanel
        open={taxProtestOpen}
        onClose={() => setTaxProtestOpen(false)}
        snapshotId={snapshots[0]?.id ?? ''}
      />

      {/* Reconciliation workflow tour */}
      <ReconciliationWorkflowTourSheet
        open={isHelpOpen}
        onOpenChange={setIsHelpOpen}
      />
    </div>
  )
}
