/**
 * ExportPanel: slide-out sheet with 6 export workflow tabs.
 *
 * Tabs:
 *   1. PDF      - single-tenant preview/download
 *   2. Batch    - multi-tenant ZIP or individual download
 *   3. ERP      - Yardi / MRI CSV export with field-mapping config
 *   4. History  - past exports list with re-download
 *   5. Board    - board presentation PDF with NOI/asset value lift
 *   6. Variance - year-over-year variance report with PDF/Excel export
 */

import { useState, useEffect } from 'react'
import {
  FileDown,
  Archive,
  Database,
  Clock,
  Loader2,
  Presentation,
  TrendingUp,
  Lock,
} from 'lucide-react'
import { toast } from 'sonner'
import { formatCalendarDate } from '@/lib/utils'

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { pluralizeWithCount } from '@/lib/pluralize'
import { Label } from '@/components/ui/label'
import { EmptyState } from '@/components/EmptyState'
import { ErrorState } from '@/components/ErrorState'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import {
  useExportPdfPreview,
  useExportBatchPdf,
  useExportErp,
  useExportHistory,
  useExportRedownload,
  useExportBoardPreview,
  useExportBoardDownload,
  useExportVariancePdf,
  useExportVarianceExcel,
} from '@/api/hooks'
import { VarianceReport as ExportVarianceReport } from '@/features/export/components/VarianceReport'
import { DetailAdvisorBanner } from '@/features/export/components/DetailAdvisorBanner'
import { useDetailAdvisor } from '@/features/export/hooks'
import type { TenantSummary } from './ExportButton'
import { PDFPreviewModal } from './PDFPreviewModal'

// ─────────────────────────────────────────────────────────────────────────────
// ERP field mappings
// ─────────────────────────────────────────────────────────────────────────────

const YARDI_FIELDS = ['account', 'amount', 'description', 'reference', 'date']
const MRI_FIELDS = ['property', 'entity', 'account', 'amount', 'description']

const YARDI_TARGETS = [
  'Account',
  'Debit',
  'Credit',
  'Description',
  'Reference',
  'PostDate',
]
const MRI_TARGETS = [
  'Property',
  'Entity',
  'Account',
  'Amount',
  'Description',
  'Date',
]

interface ERPTemplate {
  name: string
  system: 'yardi' | 'mri' | ''
  mappings: Record<string, string>
}

const TEMPLATES_KEY = 'cam_erp_templates'

function loadTemplates(): ERPTemplate[] {
  try {
    return JSON.parse(localStorage.getItem(TEMPLATES_KEY) || '[]')
  } catch {
    return []
  }
}

function saveTemplates(templates: ERPTemplate[]) {
  localStorage.setItem(TEMPLATES_KEY, JSON.stringify(templates))
}

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

export interface ExportPanelProps {
  open: boolean
  onClose: () => void
  propertyId: string
  year: number
  tenants: TenantSummary[]
  defaultTab?: string
  isBoardLocked?: boolean
  onUpgradeBoard?: () => void
}

// ─────────────────────────────────────────────────────────────────────────────
// PDF Tab
// ─────────────────────────────────────────────────────────────────────────────

function PDFTab({
  propertyId,
  year,
  enabled = true,
}: {
  propertyId: string
  year: number
  enabled?: boolean
}) {
  const [includeCharts, setIncludeCharts] = useState(false)
  const [includeNotes, setIncludeNotes] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [blobUrl, setBlobUrl] = useState<string | undefined>()

  const advisorQuery = useDetailAdvisor({ propertyId, year, enabled })

  const previewMutation = useExportPdfPreview({
    onSuccess: (data) => {
      setBlobUrl(data.blobUrl)
      setPreviewOpen(true)
    },
    onError: () => {
      toast.error('Failed to generate PDF preview')
    },
  })

  return (
    <div className="space-y-4">
      <DetailAdvisorBanner
        data={advisorQuery.data}
        isLoading={advisorQuery.isLoading}
        isError={advisorQuery.isError}
      />

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Checkbox
            id="include-charts"
            data-testid="include-charts"
            checked={includeCharts}
            onCheckedChange={(v) => setIncludeCharts(!!v)}
          />
          <Label htmlFor="include-charts">Include charts</Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="include-notes"
            data-testid="include-notes"
            checked={includeNotes}
            onCheckedChange={(v) => setIncludeNotes(!!v)}
          />
          <Label htmlFor="include-notes">Include notes</Label>
        </div>
      </div>

      <Button
        data-testid="preview-button"
        variant="outline"
        className="w-full"
        disabled={previewMutation.isPending}
        onClick={() =>
          previewMutation.mutate({
            property_id: propertyId,
            year,
            include_charts: includeCharts,
            include_notes: includeNotes,
          })
        }
      >
        {previewMutation.isPending ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <FileDown className="mr-2 h-4 w-4" aria-hidden="true" />
        )}
        Preview PDF
      </Button>

      <PDFPreviewModal
        open={previewOpen}
        blobUrl={blobUrl}
        propertyId={propertyId}
        year={year}
        includeCharts={includeCharts}
        includeNotes={includeNotes}
        onClose={() => setPreviewOpen(false)}
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Batch Tab
// ─────────────────────────────────────────────────────────────────────────────

function BatchTab({
  propertyId,
  year,
  tenants,
}: {
  propertyId: string
  year: number
  tenants: TenantSummary[]
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [mode, setMode] = useState<'zip' | 'individual'>('zip')
  const [isComplete, setIsComplete] = useState(false)

  const batchMutation = useExportBatchPdf({
    onSuccess: () => {
      setIsComplete(true)
      toast.success(
        `Exported ${selected.size} tenant${selected.size !== 1 ? 's' : ''}`
      )
    },
    onError: () => {
      toast.error('Batch export failed')
    },
  })

  const isExporting = batchMutation.isPending

  function toggleAll() {
    // Changing the selection invalidates the previous export result.
    setIsComplete(false)
    if (selected.size === tenants.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(tenants.map((t) => t.id)))
    }
  }

  function toggle(id: string) {
    // Changing the selection invalidates the previous export result.
    setIsComplete(false)
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function startBatchExport() {
    if (selected.size === 0) {
      toast.error('Select at least one tenant')
      return
    }
    setIsComplete(false)
    batchMutation.mutate({
      property_id: propertyId,
      year,
      tenant_ids: Array.from(selected),
      mode,
    })
  }

  return (
    <div className="space-y-4">
      <div data-testid="tenant-selector" className="space-y-2">
        <div className="flex items-center gap-2">
          <Checkbox
            id="select-all"
            data-testid="select-all-tenants"
            checked={selected.size === tenants.length && tenants.length > 0}
            onCheckedChange={toggleAll}
          />
          <Label htmlFor="select-all">Select all</Label>
          <span
            data-testid="selected-count"
            className="ml-auto text-sm text-muted-foreground"
          >
            {pluralizeWithCount(selected.size, 'tenant')} selected
          </span>
        </div>

        <div className="space-y-1 max-h-48 overflow-y-auto border rounded p-2">
          {tenants.map((t) => (
            <div key={t.id} className="flex items-center gap-2">
              <Checkbox
                id={`tenant-${t.id}`}
                data-testid={`tenant-checkbox-${t.id}`}
                checked={selected.has(t.id)}
                onCheckedChange={() => toggle(t.id)}
              />
              <Label htmlFor={`tenant-${t.id}`}>
                {t.name} {t.unit ? `(${t.unit})` : ''}
              </Label>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="radio"
            data-testid="export-mode-zip"
            name="export-mode"
            value="zip"
            checked={mode === 'zip'}
            onChange={() => setMode('zip')}
            className="h-4 w-4 accent-primary ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
          ZIP archive
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="radio"
            data-testid="export-mode-individual"
            name="export-mode"
            value="individual"
            checked={mode === 'individual'}
            onChange={() => setMode('individual')}
            className="h-4 w-4 accent-primary ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
          Individual files
        </label>
      </div>

      <Button
        data-testid="batch-export-button"
        className="w-full"
        disabled={isExporting || selected.size === 0}
        onClick={startBatchExport}
      >
        {isExporting ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <Archive className="mr-2 h-4 w-4" aria-hidden="true" />
        )}
        Export{' '}
        {selected.size > 0 ? pluralizeWithCount(selected.size, 'Tenant') : ''}
      </Button>

      {isExporting && (
        <div data-testid="export-progress" className="space-y-1">
          {/* Single mutation (not a polled job) → no real incremental
              progress signal, so show an honest indeterminate state instead
              of a fake frozen percentage. */}
          <Progress data-testid="progress-bar" indeterminate />
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
            Exporting {pluralizeWithCount(selected.size, 'tenant')}…
          </p>
        </div>
      )}

      {isComplete && !isExporting && (
        <div
          data-testid="export-complete"
          className="text-sm text-success-strong font-medium"
        >
          Export complete!
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ERP Tab
// ─────────────────────────────────────────────────────────────────────────────

function ERPTab({ propertyId, year }: { propertyId: string; year: number }) {
  const [erpSystem, setErpSystem] = useState<'yardi' | 'mri' | ''>('')
  const [fieldMappings, setFieldMappings] = useState<Record<string, string>>({})
  const [savingTemplate, setSavingTemplate] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [templates, setTemplates] = useState<ERPTemplate[]>(loadTemplates)
  const [selectedTemplate, setSelectedTemplate] = useState('')

  const erpMutation = useExportErp({
    onSuccess: () => toast.success('ERP file downloaded'),
    onError: () => toast.error('ERP export failed'),
  })

  const fields =
    erpSystem === 'yardi' ? YARDI_FIELDS : erpSystem === 'mri' ? MRI_FIELDS : []
  const targets = erpSystem === 'yardi' ? YARDI_TARGETS : MRI_TARGETS

  function handleSaveTemplate() {
    if (!templateName.trim()) return
    const newTemplate: ERPTemplate = {
      name: templateName,
      system: erpSystem,
      mappings: fieldMappings,
    }
    const updated = [...templates, newTemplate]
    saveTemplates(updated)
    setTemplates(updated)
    setSavingTemplate(false)
    setTemplateName('')
    toast.success('Template saved successfully')
  }

  function handleLoadTemplate(name: string) {
    setSelectedTemplate(name)
    const t = templates.find((t) => t.name === name)
    if (t) {
      if (t.system) setErpSystem(t.system)
      setFieldMappings(t.mappings)
    }
  }

  function handleReset() {
    setErpSystem('')
    setFieldMappings({})
    setSelectedTemplate('')
  }

  return (
    <div data-testid="erp-config-panel" className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="erp-system">ERP System</Label>
        <Select
          value={erpSystem}
          onValueChange={(value) => {
            setErpSystem(value as 'yardi' | 'mri' | '')
            setFieldMappings({})
          }}
        >
          <SelectTrigger
            id="erp-system"
            aria-label="ERP System"
            data-testid="erp-system-select"
            className="w-full"
          >
            <SelectValue placeholder="Select system…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="yardi">Yardi Voyager</SelectItem>
            <SelectItem value="mri">MRI Commercial</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {erpSystem && (
        <div data-testid="field-mapping-table" className="space-y-2">
          <p className="text-sm font-medium">Field Mappings</p>
          {fields.map((field) => (
            <div
              key={field}
              data-testid={`mapping-row-${field}`}
              className="flex items-center gap-2"
            >
              <span className="w-24 text-sm text-muted-foreground capitalize">
                {field}
              </span>
              <Select
                value={fieldMappings[field] || '__default__'}
                onValueChange={(value) =>
                  setFieldMappings((prev) => ({
                    ...prev,
                    [field]: value === '__default__' ? '' : value,
                  }))
                }
              >
                <SelectTrigger
                  data-testid={`target-field-${field}`}
                  aria-label={`Map ${field} field`}
                  className="flex-1"
                >
                  <SelectValue placeholder="(default)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__default__">(default)</SelectItem>
                  {targets.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      )}

      {templates.length > 0 && (
        <div className="space-y-1">
          <Label>Load template</Label>
          <Select
            value={selectedTemplate}
            onValueChange={(value) => handleLoadTemplate(value)}
          >
            <SelectTrigger
              data-testid="template-select"
              aria-label="Load template"
              className="w-full"
            >
              <SelectValue placeholder="Select template…" />
            </SelectTrigger>
            <SelectContent>
              {templates.map((t) => (
                <SelectItem key={t.name} value={t.name}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="flex gap-2">
        <Button
          data-testid="save-template-button"
          variant="outline"
          size="sm"
          onClick={() => setSavingTemplate(true)}
          className="flex-1"
        >
          Save Template
        </Button>
        <Button
          data-testid="reset-config-button"
          variant="ghost"
          size="sm"
          onClick={handleReset}
        >
          Reset
        </Button>
      </div>

      {savingTemplate && (
        <div className="space-y-2 border rounded p-3">
          <label
            htmlFor="template-name-input"
            className="block text-sm font-medium"
          >
            Template name
          </label>
          <input
            id="template-name-input"
            data-testid="template-name-input"
            type="text"
            placeholder="Template name"
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            className="w-full border rounded px-2 py-1 text-sm"
          />
          <Button
            data-testid="confirm-save-template"
            size="sm"
            onClick={handleSaveTemplate}
          >
            Save
          </Button>
        </div>
      )}

      {erpSystem && (
        <Button
          data-testid="export-erp-button"
          className="w-full"
          disabled={!erpSystem || erpMutation.isPending}
          onClick={() =>
            erpMutation.mutate({
              property_id: propertyId,
              year,
              erp_system: erpSystem as 'yardi' | 'mri',
              field_mappings: fieldMappings,
            })
          }
        >
          {erpMutation.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Database className="mr-2 h-4 w-4" aria-hidden="true" />
          )}
          Export ERP File
        </Button>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// History Tab
// ─────────────────────────────────────────────────────────────────────────────

function HistoryTab({
  propertyId,
  enabled = true,
}: {
  propertyId: string
  enabled?: boolean
}) {
  const [formatFilter, setFormatFilter] = useState('')

  const { data, isLoading, isError, isPaused, refetch } = useExportHistory(
    propertyId,
    formatFilter || undefined,
    { enabled: enabled && !!propertyId }
  )

  const isOffline = isPaused && !data

  const items = data?.items ?? []

  const redownload = useExportRedownload({
    onError: (error) => {
      if (error.statusCode === 410) {
        toast.error(
          'This export is no longer available. Please re-generate it.'
        )
      } else if (error.statusCode === 404) {
        toast.error('Export not found. It may have been deleted.')
      } else {
        toast.error('Failed to download export')
      }
    },
  })

  function handleRedownload(item: { id: string; file_name: string }) {
    // The app is Bearer-token authenticated, so we cannot open the API route
    // directly (the browser would not attach the token). Fetch a signed URL
    // first, then open it.
    redownload.mutate(item.id)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Label htmlFor="format-filter">Filter by format</Label>
        <Select
          value={formatFilter || '__all__'}
          onValueChange={(value) =>
            setFormatFilter(value === '__all__' ? '' : value)
          }
        >
          <SelectTrigger
            id="format-filter"
            data-testid="format-filter"
            className="w-36"
          >
            <SelectValue placeholder="All formats" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All formats</SelectItem>
            <SelectItem value="pdf">PDF</SelectItem>
            <SelectItem value="excel">Excel</SelectItem>
            <SelectItem value="yardi">Yardi</SelectItem>
            <SelectItem value="mri">MRI</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Loading history…
        </div>
      ) : isError || isOffline ? (
        <ErrorState
          data-testid="export-history-error"
          title="Couldn't load export history"
          offline={isOffline}
          action={{ onClick: () => void refetch() }}
          size="sm"
        />
      ) : (
        <div data-testid="export-history-table" className="space-y-2">
          {items.length === 0 ? (
            <EmptyState
              icon={FileDown}
              title="No exports yet"
              description="Your exported files show up here."
              size="sm"
            />
          ) : (
            items.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between border rounded p-2 text-sm"
              >
                <div>
                  <p className="font-medium">{item.file_name}</p>
                  <p className="text-muted-foreground text-xs">
                    {item.format.toUpperCase()} ·{' '}
                    {formatCalendarDate(item.created_at)} ·{' '}
                    {item.created_by_name}
                  </p>
                </div>
                <Button
                  data-testid={`download-export-${item.id}`}
                  variant="ghost"
                  size="sm"
                  aria-label={`Re-download ${item.file_name}`}
                  onClick={() => handleRedownload(item)}
                >
                  <FileDown className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Board Tab
// ─────────────────────────────────────────────────────────────────────────────

function BoardTab({
  propertyId,
  year,
  isLocked = false,
  onUpgrade,
}: {
  propertyId: string
  year: number
  isLocked?: boolean
  onUpgrade?: () => void
}) {
  const [capRateTenths, setCapRateTenths] = useState(70) // 7.0% default
  const [previewOpen, setPreviewOpen] = useState(false)
  const [blobUrl, setBlobUrl] = useState<string | undefined>()

  // Revoke blob URL on unmount (e.g. sheet closed without closing preview modal)
  useEffect(() => {
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl)
    }
  }, [blobUrl])

  // Use toFixed(4) to avoid float imprecision (e.g. 70/1000 = 0.06999...)
  const capRate = parseFloat((capRateTenths / 1000).toFixed(4))

  const previewMutation = useExportBoardPreview({
    onSuccess: ({ blobUrl: url }) => {
      setBlobUrl(url)
      setPreviewOpen(true)
    },
    onError: (error) =>
      toast.error(
        error.statusCode === 402
          ? 'Subscription required for board presentation'
          : 'Failed to generate board presentation'
      ),
  })

  const downloadMutation = useExportBoardDownload({
    onSuccess: () => toast.success('Board presentation downloaded'),
    onError: (error) =>
      toast.error(
        error.statusCode === 402
          ? 'Subscription required for board presentation'
          : 'Failed to download board presentation'
      ),
  })

  const requestPayload = { property_id: propertyId, year, cap_rate: capRate }

  if (isLocked) {
    return (
      <div
        data-testid="board-locked"
        className="rounded-lg border border-warning/30 bg-warning/10 p-4"
      >
        <p className="text-sm text-warning-foreground">
          Subscription required to generate board-ready NOI and asset value lift
          reports.
        </p>
        <Button
          data-testid="board-upgrade-button"
          size="sm"
          className="mt-3"
          onClick={onUpgrade}
        >
          <Lock className="mr-2 h-4 w-4" aria-hidden="true" />
          Upgrade Plan
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Generate a one-page board summary showing estimated NOI and asset value
        based on your CAM recovery.
      </p>

      <div className="space-y-1">
        <label htmlFor="board-cap-rate-slider" className="text-sm font-medium">
          Cap rate:{' '}
          <span className="font-semibold">
            {(capRateTenths / 10).toFixed(1)}%
          </span>
        </label>
        <input
          type="range"
          id="board-cap-rate-slider"
          data-testid="board-cap-rate-slider"
          aria-label="Cap rate"
          aria-valuetext={`${(capRateTenths / 10).toFixed(1)}%`}
          min="20"
          max="120"
          step="1"
          value={capRateTenths}
          onChange={(e) => setCapRateTenths(Number(e.target.value))}
          className="w-full cursor-pointer accent-primary rounded-full ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>2.0%</span>
          <span>12.0%</span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Button
          data-testid="board-preview-button"
          variant="outline"
          size="sm"
          className="w-full gap-2"
          disabled={previewMutation.isPending}
          onClick={() => previewMutation.mutate(requestPayload)}
        >
          {previewMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Presentation className="h-4 w-4" aria-hidden="true" />
          )}
          Preview Presentation
        </Button>

        <Button
          data-testid="board-download-button"
          size="sm"
          className="w-full gap-2"
          disabled={downloadMutation.isPending}
          onClick={() => downloadMutation.mutate(requestPayload)}
        >
          {downloadMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <FileDown className="h-4 w-4" aria-hidden="true" />
          )}
          Download Presentation
        </Button>
      </div>

      <PDFPreviewModal
        open={previewOpen}
        blobUrl={blobUrl}
        propertyId={propertyId}
        year={year}
        onClose={() => {
          setPreviewOpen(false)
          if (blobUrl) URL.revokeObjectURL(blobUrl)
          setBlobUrl(undefined)
        }}
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Variance Tab
// ─────────────────────────────────────────────────────────────────────────────

function VarianceTab({
  propertyId,
  year,
}: {
  propertyId: string
  year: number
}) {
  const exportPdfMutation = useExportVariancePdf({
    onSuccess: () => toast.success('Statement check report downloaded'),
    onError: () => toast.error('Failed to export statement check PDF'),
  })
  const exportExcelMutation = useExportVarianceExcel({
    onSuccess: () => toast.success('Statement check Excel downloaded'),
    onError: () => toast.error('Failed to export statement check Excel'),
  })
  const requestBase = {
    property_id: propertyId,
    current_year: year,
    prior_year: year - 1,
    threshold_percent: 10,
  }
  return (
    <div data-testid="variance-report" className="space-y-4">
      <ExportVarianceReport
        propertyId={propertyId}
        years={[year - 1, year]}
        onExportPDF={() => exportPdfMutation.mutate(requestBase)}
        onExportExcel={() => exportExcelMutation.mutate(requestBase)}
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ExportPanel
// ─────────────────────────────────────────────────────────────────────────────

export function ExportPanel({
  open,
  onClose,
  propertyId,
  year,
  tenants,
  defaultTab,
  isBoardLocked = false,
  onUpgradeBoard,
}: ExportPanelProps) {
  const [activeTab, setActiveTab] = useState(defaultTab ?? 'pdf')
  const [prevOpen, setPrevOpen] = useState(open)

  // Sync activeTab when panel (re)opens with a new defaultTab.
  // Uses the "update state during render" pattern to avoid useEffect.
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) setActiveTab(defaultTab ?? 'pdf')
  }

  if (!open) return null

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Export Reconciliation Data</SheetTitle>
          <SheetDescription>
            Preview, batch, and download reconciliation exports for this
            property.
          </SheetDescription>
        </SheetHeader>

        <div data-testid="export-panel" className="mt-4">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            {/* h-auto + gap override the base TabsList's fixed h-10: at narrow
                widths the 6 triggers wrap to 2-3 grid rows, and without h-auto
                the 40px-tall container would clip and paint the overflow rows
                over the tab panel below (F1). min-h-9 keeps every wrapped row
                an even height. */}
            <TabsList className="grid h-auto w-full grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-6">
              <TabsTrigger
                value="pdf"
                data-testid="format-card-pdf"
                className="min-h-9"
              >
                PDF
              </TabsTrigger>
              <TabsTrigger
                value="batch"
                data-testid="batch-export-tab"
                className="min-h-9"
              >
                Batch
              </TabsTrigger>
              <TabsTrigger
                value="erp"
                data-testid="format-card-erp"
                className="min-h-9"
              >
                ERP
              </TabsTrigger>
              <TabsTrigger
                value="history"
                data-testid="export-history-tab"
                className="min-h-9"
              >
                <Clock className="mr-1 h-3 w-3" aria-hidden="true" />
                History
              </TabsTrigger>
              <TabsTrigger
                value="board"
                data-testid="board-export-tab"
                className="min-h-9"
              >
                Board
              </TabsTrigger>
              <TabsTrigger
                value="variance"
                data-testid="format-card-variance"
                className="min-h-9"
              >
                <TrendingUp className="mr-1 h-3 w-3" aria-hidden="true" />
                Statement Check
              </TabsTrigger>
            </TabsList>

            <TabsContent
              value="pdf"
              className="pt-4 data-[state=inactive]:hidden"
              forceMount
            >
              <PDFTab
                propertyId={propertyId}
                year={year}
                enabled={activeTab === 'pdf'}
              />
            </TabsContent>

            <TabsContent
              value="batch"
              className="pt-4 data-[state=inactive]:hidden"
              forceMount
            >
              <BatchTab propertyId={propertyId} year={year} tenants={tenants} />
            </TabsContent>

            <TabsContent
              value="erp"
              className="pt-4 data-[state=inactive]:hidden"
              forceMount
            >
              <ERPTab propertyId={propertyId} year={year} />
            </TabsContent>

            <TabsContent
              value="history"
              className="pt-4 data-[state=inactive]:hidden"
              forceMount
            >
              <HistoryTab
                propertyId={propertyId}
                enabled={activeTab === 'history'}
              />
            </TabsContent>

            <TabsContent
              value="board"
              className="pt-4 data-[state=inactive]:hidden"
              forceMount
            >
              <BoardTab
                propertyId={propertyId}
                year={year}
                isLocked={isBoardLocked}
                {...(onUpgradeBoard !== undefined && {
                  onUpgrade: onUpgradeBoard,
                })}
              />
            </TabsContent>

            <TabsContent value="variance" className="pt-4">
              <VarianceTab propertyId={propertyId} year={year} />
            </TabsContent>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  )
}
