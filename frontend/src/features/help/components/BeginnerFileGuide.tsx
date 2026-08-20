import { FileSpreadsheet, FileText, FolderOpen } from 'lucide-react'
import { GuideCallout } from './GuideCallout'

interface BeginnerFileGuideProps {
  type: 'spreadsheet' | 'pdf' | 'billing'
}

const COPY = {
  spreadsheet: {
    icon: FileSpreadsheet,
    title: 'Before you upload this spreadsheet',
    rows: [
      'A spreadsheet is a table file, usually ending in .csv, .xls, or .xlsx.',
      'If you exported it from Yardi, MRI, AppFolio, RealPage, or Excel, it is probably the right type.',
      'If you cannot find it, check your Downloads folder or search your computer for the report name.',
    ],
  },
  pdf: {
    icon: FileText,
    title: 'Before you upload a PDF',
    rows: [
      'A PDF is a document file that usually ends in .pdf and opens like a printable page.',
      'Choose the property first so CapVeri knows where the lease belongs.',
      'Is the file too large? Scan it at a lower quality. You can also split it or ask the sender for a smaller PDF.',
    ],
  },
  billing: {
    icon: FolderOpen,
    title: 'Before you add billing data',
    rows: [
      'Billing data means what you billed tenants. It covers CAM from last year.',
      'Use a CAM billed report if you have one. One total amount is okay for a first estimate.',
      'Use the same year as your expense file. That way the numbers line up.',
    ],
  },
}

export function BeginnerFileGuide({ type }: BeginnerFileGuideProps) {
  const content = COPY[type]
  const Icon = content.icon

  return (
    <GuideCallout title={content.title}>
      <div className="flex gap-3">
        <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <ul className="space-y-1.5">
          {content.rows.map((row) => (
            <li key={row}>{row}</li>
          ))}
        </ul>
      </div>
    </GuideCallout>
  )
}
