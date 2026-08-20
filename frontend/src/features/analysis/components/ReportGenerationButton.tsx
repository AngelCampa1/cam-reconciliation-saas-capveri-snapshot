/**
 * Report Generation Button Component
 *
 * Provides buttons to generate PDF and Excel historical analysis reports.
 */

import { useState } from 'react'
import { FileDown, FileSpreadsheet, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { logger } from '@/lib/logger'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toast } from 'sonner'
import { authenticatedFetch } from '@/api/authFetch'
import type { ReportRequest } from '../types'

export interface ReportGenerationButtonProps {
  propertyId: string
  years: number[]
  disabled?: boolean
}

export function ReportGenerationButton({
  propertyId,
  years,
  disabled = false,
}: ReportGenerationButtonProps) {
  const [isGenerating, setIsGenerating] = useState(false)

  const handleGeneratePDF = async () => {
    setIsGenerating(true)
    try {
      const request: ReportRequest = {
        property_id: propertyId,
        years,
        include_charts: false,
      }

      const response = await authenticatedFetch(
        '/api/v1/reports/historical/pdf',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(request),
        }
      )

      if (!response.ok) {
        throw new Error('Failed to generate PDF report')
      }

      const data = await response.json()

      // Open signed URL in new tab
      window.open(data.report_url, '_blank', 'noopener,noreferrer')

      toast.success('PDF report ready')
    } catch (error) {
      logger.error('PDF report generation failed', { propertyId, years, error })
      toast.error('Failed to generate PDF report')
    } finally {
      setIsGenerating(false)
    }
  }

  const handleGenerateExcel = async () => {
    setIsGenerating(true)
    try {
      const request: ReportRequest = {
        property_id: propertyId,
        years,
        include_charts: false,
      }

      const response = await authenticatedFetch(
        '/api/v1/reports/historical/excel',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(request),
        }
      )

      if (!response.ok) {
        throw new Error('Failed to generate Excel report')
      }

      // Get filename from Content-Disposition header or use default
      const contentDisposition = response.headers.get('Content-Disposition')
      const filenameMatch = contentDisposition?.match(/filename="(.+)"/)
      const filename =
        filenameMatch?.[1] || `historical_analysis_${propertyId}.xlsx`

      // Download file
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)

      toast.success('Excel report downloaded')
    } catch (error) {
      logger.error('Excel report generation failed', {
        propertyId,
        years,
        error,
      })
      toast.error('Failed to generate Excel report')
    } finally {
      setIsGenerating(false)
    }
  }

  const isDisabled = disabled || isGenerating || years.length < 2

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" disabled={isDisabled}>
          <FileDown className="mr-2 h-4 w-4" aria-hidden="true" />
          {isGenerating ? 'Generating...' : 'Generate Report'}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={handleGeneratePDF} disabled={isGenerating}>
          {isGenerating ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <FileDown className="mr-2 h-4 w-4" aria-hidden="true" />
          )}
          PDF Report
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleGenerateExcel} disabled={isGenerating}>
          {isGenerating ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <FileSpreadsheet className="mr-2 h-4 w-4" aria-hidden="true" />
          )}
          Excel Report
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
