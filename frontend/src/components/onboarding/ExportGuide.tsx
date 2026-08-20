/**
 * ExportGuide: collapsible "Not sure how to get this file? Here is how." banner.
 *
 * Shown above each upload zone in the onboarding wizard. Tabs for the four
 * major property management systems with quick-tip content per upload type.
 */

import { useState } from 'react'
import { ChevronDown, ExternalLink } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

export type ExportGuideType = 'rent-roll' | 'gl' | 'cam-billed'

interface SystemTip {
  tip: string
  anchor: string
}

interface Tips {
  yardi: SystemTip
  mri: SystemTip
  appfolio: SystemTip
  realpage: SystemTip
}

// ─── Content ──────────────────────────────────────────────────────────────────

const TIPS: Record<ExportGuideType, Tips> = {
  'rent-roll': {
    yardi: {
      tip: 'Leasing → Reports → Rent Roll with Lease Charges. Set the month and click Export to Excel, then save as CSV. You need columns for Unit, Tenant, SF, Market Rent, Monthly Rent, and lease dates.',
      anchor: '#yardi-rent-roll',
    },
    mri: {
      tip: 'Commercial → Reporting → Rent Roll. Run the report, then hit the export button and pick CSV (or type a .csv filename if it asks for one). Columns should include suite number, tenant name, square footage, and monthly rent.',
      anchor: '#mri-rent-roll',
    },
    appfolio: {
      tip: 'Reports → Property and Unit Reports → Rent Roll. Click Customize to make sure Unit, Sq. Ft., Market Rent, and Lease dates are turned on, then Actions → Export as CSV.',
      anchor: '#appfolio-rent-roll',
    },
    realpage: {
      tip: 'OneSite → Reports → Rent Roll. Once the report loads, look for the Excel/CSV export icon in the toolbar. Export with unit, tenant, and lease term columns.',
      anchor: '#realpage-rent-roll',
    },
  },
  gl: {
    yardi: {
      tip: 'Accounting → General Ledger Analytics. Set your property, Jan 1 to Dec 31 date range, and click Submit. Use the spreadsheet icon to export to Excel, then save that file as CSV (File → Save As → CSV Comma Delimited).',
      anchor: '#yardi-gl',
    },
    mri: {
      tip: 'Commercial → Financials → General Ledger. Pick your property and date range, run the report, then export. If it asks for a filename, use .csv as the extension. That forces comma-delimited output instead of Excel.',
      anchor: '#mri-gl',
    },
    appfolio: {
      tip: 'Reports → Financial Transactions → General Ledger. Set your date range and property, then Actions → Export as CSV. The file will include account code, description, date, debit, and credit columns.',
      anchor: '#appfolio-gl',
    },
    realpage: {
      tip: 'Accounting → Reports → General Ledger. Filter by property and date range, run it, then export to CSV from the toolbar.',
      anchor: '#realpage-gl',
    },
  },
  'cam-billed': {
    yardi: {
      tip: 'Commercial → CAM Reconciliation. Open the prior-year reconciliation for your property and export to Excel, then save as CSV. The report should show tenant, suite, total CAM billed.',
      anchor: '#yardi-cam-billed',
    },
    mri: {
      tip: "Commercial → Retail Recoveries → CAM Reconciliation. Run the reconciliation report for the prior year, then use Rapid Reports' export to download as CSV.",
      anchor: '#mri-cam-billed',
    },
    appfolio: {
      tip: "Reports → Owner Reports → CAM Reconciliation (if your AppFolio plan includes CAM). Actions → Export as CSV. If you don't have a reconciliation report, use Reports → CAM Charges instead.",
      anchor: '#appfolio-cam-billed',
    },
    realpage: {
      tip: 'Commercial → Reports → CAM Reconciliation Summary. Set the prior year period and export to CSV. You need the total CAM charged per tenant column.',
      anchor: '#realpage-cam-billed',
    },
  },
}

// Plain-English name for the file each guide helps you find. Shown inside the
// help panel so a first-time reader knows which file the steps are about.
const TYPE_LABELS: Record<ExportGuideType, string> = {
  'rent-roll': 'a tenant list (your rent roll)',
  gl: 'a list of what you spent (your GL, or general ledger)',
  'cam-billed': 'last year’s shared-cost bills (your CAM billed report)',
}

// ─── Component ────────────────────────────────────────────────────────────────

interface ExportGuideProps {
  type: ExportGuideType
}

export function ExportGuide({ type }: ExportGuideProps) {
  const [isOpen, setIsOpen] = useState(false)
  const tips = TIPS[type]
  const label = TYPE_LABELS[type]

  return (
    <div
      data-testid="export-guide"
      className="bg-primary/5 border border-primary/20 rounded-lg mb-4"
    >
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-primary hover:bg-primary/10 rounded-lg transition-colors duration-200"
        aria-expanded={isOpen}
        aria-controls="export-guide-panel"
      >
        <span>Not sure how to get this file? Here is how.</span>
        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 transition-transform duration-200',
            isOpen && 'rotate-180'
          )}
          aria-hidden="true"
        />
      </button>

      {isOpen && (
        <div id="export-guide-panel" className="px-4 pb-4">
          <p className="text-sm text-primary/90 leading-relaxed mb-3">
            You need {label}. Pick the program you use below and follow the
            steps to save the file. Then come back and upload it.
          </p>
          <Tabs defaultValue="yardi">
            <TabsList className="mb-3">
              <TabsTrigger value="yardi">Yardi</TabsTrigger>
              <TabsTrigger value="mri">MRI</TabsTrigger>
              <TabsTrigger value="appfolio">AppFolio</TabsTrigger>
              <TabsTrigger value="realpage">RealPage</TabsTrigger>
            </TabsList>

            {(['yardi', 'mri', 'appfolio', 'realpage'] as const).map(
              (system) => (
                <TabsContent key={system} value={system}>
                  <p className="text-sm text-primary/90 leading-relaxed mb-2">
                    {tips[system].tip}
                  </p>
                  <a
                    href={`/resources/export-guide${tips[system].anchor}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    View full guide
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </TabsContent>
              )
            )}
          </Tabs>
        </div>
      )}
    </div>
  )
}
