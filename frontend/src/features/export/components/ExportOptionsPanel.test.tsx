/**
 * Tests for ExportOptionsPanel component.
 *
 * Verifies export format selection and configuration options.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ExportOptionsPanel } from './ExportOptionsPanel'

describe('ExportOptionsPanel', () => {
  const mockOnExport = vi.fn()
  const defaultProps = {
    snapshotId: 'test-snapshot-id',
    onExport: mockOnExport,
  }

  beforeEach(() => {
    mockOnExport.mockClear()
  })

  describe('Format Selection', () => {
    it('displays all export format options', () => {
      render(<ExportOptionsPanel {...defaultProps} />)

      expect(screen.getByText('PDF Tenant Packet')).toBeInTheDocument()
      expect(screen.getByText('Excel Spreadsheet')).toBeInTheDocument()
      expect(screen.getByText('Yardi Voyager')).toBeInTheDocument()
      expect(screen.getByText('MRI Commercial')).toBeInTheDocument()
    })

    it('shows format descriptions', () => {
      render(<ExportOptionsPanel {...defaultProps} />)

      expect(
        screen.getByText(
          'Professional reconciliation statement for tenant delivery'
        )
      ).toBeInTheDocument()
      expect(
        screen.getByText('Detailed workbook with calculations and formulas')
      ).toBeInTheDocument()
      expect(
        screen.getByText('Journal entry import format for Yardi')
      ).toBeInTheDocument()
      expect(
        screen.getByText('Fixed-width format for MRI import')
      ).toBeInTheDocument()
    })

    it('highlights selected format', async () => {
      const user = userEvent.setup()
      render(<ExportOptionsPanel {...defaultProps} />)

      // Get the card element (it's the parent of the text)
      const pdfCard = screen
        .getByText('PDF Tenant Packet')
        .closest('[class*="cursor-pointer"]')
      expect(pdfCard).not.toHaveClass('ring-primary')

      await user.click(screen.getByText('PDF Tenant Packet'))

      expect(pdfCard).toHaveClass('ring-primary')
    })

    it('allows changing format selection', async () => {
      const user = userEvent.setup()
      render(<ExportOptionsPanel {...defaultProps} />)

      // Select PDF
      await user.click(screen.getByText('PDF Tenant Packet'))
      const pdfCard = screen
        .getByText('PDF Tenant Packet')
        .closest('[class*="cursor-pointer"]')
      expect(pdfCard).toHaveClass('ring-primary')

      // Select Excel
      await user.click(screen.getByText('Excel Spreadsheet'))
      const excelCard = screen
        .getByText('Excel Spreadsheet')
        .closest('[class*="cursor-pointer"]')
      expect(excelCard).toHaveClass('ring-primary')
      expect(pdfCard).not.toHaveClass('ring-primary')
    })
  })

  describe('Format-Specific Options', () => {
    it('shows PDF options when PDF format selected', async () => {
      const user = userEvent.setup()
      render(<ExportOptionsPanel {...defaultProps} />)

      await user.click(screen.getByText('PDF Tenant Packet'))

      expect(screen.getByText('PDF Options')).toBeInTheDocument()
      expect(screen.getByLabelText('Include Cover Page')).toBeInTheDocument()
      expect(
        screen.getByLabelText('Include Calculation Details')
      ).toBeInTheDocument()
    })

    it('shows Excel options when Excel format selected', async () => {
      const user = userEvent.setup()
      render(<ExportOptionsPanel {...defaultProps} />)

      await user.click(screen.getByText('Excel Spreadsheet'))

      expect(screen.getByText('Excel Options')).toBeInTheDocument()
      expect(
        screen.getByLabelText('Separate Sheets Per Tenant')
      ).toBeInTheDocument()
      expect(screen.getByLabelText('Include Formulas')).toBeInTheDocument()
    })

    it('shows ERP options when Yardi format selected', async () => {
      const user = userEvent.setup()
      render(<ExportOptionsPanel {...defaultProps} />)

      await user.click(screen.getByText('Yardi Voyager'))

      expect(screen.getByText('ERP Export Options')).toBeInTheDocument()
      expect(
        screen.getByText('Export will be formatted for Yardi Voyager import')
      ).toBeInTheDocument()
    })

    it('shows ERP options when MRI format selected', async () => {
      const user = userEvent.setup()
      render(<ExportOptionsPanel {...defaultProps} />)

      await user.click(screen.getByText('MRI Commercial'))

      expect(screen.getByText('ERP Export Options')).toBeInTheDocument()
      expect(
        screen.getByText('Export will be formatted for MRI Commercial import')
      ).toBeInTheDocument()
    })

    it('does not show options when no format selected', () => {
      render(<ExportOptionsPanel {...defaultProps} />)

      expect(screen.queryByText('PDF Options')).not.toBeInTheDocument()
      expect(screen.queryByText('Excel Options')).not.toBeInTheDocument()
      expect(screen.queryByText('ERP Export Options')).not.toBeInTheDocument()
    })
  })

  describe('PDF Options Toggle', () => {
    it('includes cover page by default', async () => {
      const user = userEvent.setup()
      render(<ExportOptionsPanel {...defaultProps} />)

      await user.click(screen.getByText('PDF Tenant Packet'))

      const coverPageSwitch = screen.getByLabelText('Include Cover Page')
      expect(coverPageSwitch).toBeChecked()
    })

    it('excludes calculation details by default', async () => {
      const user = userEvent.setup()
      render(<ExportOptionsPanel {...defaultProps} />)

      await user.click(screen.getByText('PDF Tenant Packet'))

      const detailsSwitch = screen.getByLabelText('Include Calculation Details')
      expect(detailsSwitch).not.toBeChecked()
    })

    it('toggles cover page option', async () => {
      const user = userEvent.setup()
      render(<ExportOptionsPanel {...defaultProps} />)

      await user.click(screen.getByText('PDF Tenant Packet'))
      const coverPageSwitch = screen.getByLabelText('Include Cover Page')

      await user.click(coverPageSwitch)
      expect(coverPageSwitch).not.toBeChecked()

      await user.click(coverPageSwitch)
      expect(coverPageSwitch).toBeChecked()
    })

    it('toggles calculation details option', async () => {
      const user = userEvent.setup()
      render(<ExportOptionsPanel {...defaultProps} />)

      await user.click(screen.getByText('PDF Tenant Packet'))
      const detailsSwitch = screen.getByLabelText('Include Calculation Details')

      await user.click(detailsSwitch)
      expect(detailsSwitch).toBeChecked()

      await user.click(detailsSwitch)
      expect(detailsSwitch).not.toBeChecked()
    })
  })

  describe('Excel Options Toggle', () => {
    it('includes separate sheets per tenant by default', async () => {
      const user = userEvent.setup()
      render(<ExportOptionsPanel {...defaultProps} />)

      await user.click(screen.getByText('Excel Spreadsheet'))

      const separateSheetsSwitch = screen.getByLabelText(
        'Separate Sheets Per Tenant'
      )
      expect(separateSheetsSwitch).toBeChecked()
    })

    it('includes formulas by default', async () => {
      const user = userEvent.setup()
      render(<ExportOptionsPanel {...defaultProps} />)

      await user.click(screen.getByText('Excel Spreadsheet'))

      const formulasSwitch = screen.getByLabelText('Include Formulas')
      expect(formulasSwitch).toBeChecked()
    })

    it('toggles separate sheets option', async () => {
      const user = userEvent.setup()
      render(<ExportOptionsPanel {...defaultProps} />)

      await user.click(screen.getByText('Excel Spreadsheet'))
      const separateSheetsSwitch = screen.getByLabelText(
        'Separate Sheets Per Tenant'
      )

      await user.click(separateSheetsSwitch)
      expect(separateSheetsSwitch).not.toBeChecked()

      await user.click(separateSheetsSwitch)
      expect(separateSheetsSwitch).toBeChecked()
    })

    it('toggles formulas option', async () => {
      const user = userEvent.setup()
      render(<ExportOptionsPanel {...defaultProps} />)

      await user.click(screen.getByText('Excel Spreadsheet'))
      const formulasSwitch = screen.getByLabelText('Include Formulas')

      await user.click(formulasSwitch)
      expect(formulasSwitch).not.toBeChecked()

      await user.click(formulasSwitch)
      expect(formulasSwitch).toBeChecked()
    })
  })

  describe('Export Button', () => {
    it('is disabled when no format selected', () => {
      render(<ExportOptionsPanel {...defaultProps} />)

      const exportButton = screen.getByRole('button', { name: 'Export' })
      expect(exportButton).toBeDisabled()
    })

    it('is enabled when format selected', async () => {
      const user = userEvent.setup()
      render(<ExportOptionsPanel {...defaultProps} />)

      await user.click(screen.getByText('PDF Tenant Packet'))

      const exportButton = screen.getByRole('button', { name: 'Export' })
      expect(exportButton).toBeEnabled()
    })

    it('is disabled during export', () => {
      render(<ExportOptionsPanel {...defaultProps} isExporting={true} />)

      const exportButton = screen.getByRole('button', { name: 'Exporting…' })
      expect(exportButton).toBeDisabled()
    })

    it('shows loading text during export', () => {
      render(<ExportOptionsPanel {...defaultProps} isExporting={true} />)

      expect(screen.getByText('Exporting…')).toBeInTheDocument()
    })
  })

  describe('Export Callback', () => {
    it('calls onExport with PDF format and options', async () => {
      const user = userEvent.setup()
      render(<ExportOptionsPanel {...defaultProps} />)

      await user.click(screen.getByText('PDF Tenant Packet'))
      await user.click(screen.getByLabelText('Include Calculation Details'))
      await user.click(screen.getByRole('button', { name: 'Export' }))

      expect(mockOnExport).toHaveBeenCalledWith('pdf', {
        includeCoverPage: true,
        includeCalculationDetails: true,
      })
    })

    it('calls onExport with Excel format and options', async () => {
      const user = userEvent.setup()
      render(<ExportOptionsPanel {...defaultProps} />)

      await user.click(screen.getByText('Excel Spreadsheet'))
      await user.click(screen.getByLabelText('Separate Sheets Per Tenant'))
      await user.click(screen.getByRole('button', { name: 'Export' }))

      expect(mockOnExport).toHaveBeenCalledWith('excel', {
        separateSheetsPerTenant: false,
        includeFormulas: true,
      })
    })

    it('calls onExport with Yardi format and options', async () => {
      const user = userEvent.setup()
      render(<ExportOptionsPanel {...defaultProps} />)

      await user.click(screen.getByText('Yardi Voyager'))
      await user.click(screen.getByRole('button', { name: 'Export' }))

      expect(mockOnExport).toHaveBeenCalledWith('yardi', {
        targetSystem: 'yardi',
      })
    })

    it('calls onExport with MRI format and options', async () => {
      const user = userEvent.setup()
      render(<ExportOptionsPanel {...defaultProps} />)

      await user.click(screen.getByText('MRI Commercial'))
      await user.click(screen.getByRole('button', { name: 'Export' }))

      expect(mockOnExport).toHaveBeenCalledWith('mri', {
        targetSystem: 'mri',
      })
    })
  })
})
