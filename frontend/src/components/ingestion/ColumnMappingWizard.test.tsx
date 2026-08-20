import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  ColumnMappingWizard,
  SampleData,
  ColumnMapping,
} from './ColumnMappingWizard'

describe('ColumnMappingWizard', () => {
  const mockSampleData: SampleData[] = [
    {
      columnName: 'Account',
      sampleValues: ['6000', '6100', '6200', '7000', '7100'],
    },
    {
      columnName: 'Amount',
      sampleValues: ['1000.00', '2500.50', '750.25', '3200.00', '450.75'],
    },
    {
      columnName: 'Transaction Date',
      sampleValues: [
        '2024-01-15',
        '2024-01-16',
        '2024-01-17',
        '2024-01-18',
        '2024-01-19',
      ],
    },
    {
      columnName: 'Notes',
      sampleValues: [
        'Utilities payment',
        'Janitorial services',
        'Insurance premium',
        'Property taxes',
        'Maintenance',
      ],
    },
  ]

  const requiredFields = ['account', 'amount', 'date']
  const optionalFields = ['description', 'reference']

  it('renders column mapping table with sample data', () => {
    const mockConfirm = vi.fn()

    render(
      <ColumnMappingWizard
        sampleData={mockSampleData}
        requiredFields={requiredFields}
        optionalFields={optionalFields}
        onConfirm={mockConfirm}
      />
    )

    expect(screen.getByText('Map Columns')).toBeInTheDocument()
    expect(screen.getByText('Account')).toBeInTheDocument()
    expect(screen.getByText('Amount')).toBeInTheDocument()
    expect(screen.getByText('Transaction Date')).toBeInTheDocument()
    expect(screen.getByText('Notes')).toBeInTheDocument()
  })

  it('displays sample values for each column', () => {
    const mockConfirm = vi.fn()

    render(
      <ColumnMappingWizard
        sampleData={mockSampleData}
        requiredFields={requiredFields}
        optionalFields={optionalFields}
        onConfirm={mockConfirm}
      />
    )

    expect(screen.getByText('6000')).toBeInTheDocument()
    expect(screen.getByText('1000.00')).toBeInTheDocument()
    expect(screen.getByText('2024-01-15')).toBeInTheDocument()
    expect(screen.getByText('Utilities payment')).toBeInTheDocument()
  })

  it('auto-detects initial mappings based on column names', () => {
    const mockConfirm = vi.fn()

    render(
      <ColumnMappingWizard
        sampleData={mockSampleData}
        requiredFields={requiredFields}
        optionalFields={optionalFields}
        onConfirm={mockConfirm}
      />
    )

    // Auto-detection should map "Account" to "account", "Amount" to "amount", etc.
    // We can verify by checking if Continue button is enabled (all required fields mapped)
    const continueButton = screen.getByRole('button', {
      name: /Continue with Mapping/,
    })
    expect(continueButton).not.toBeDisabled()
  })

  it('allows changing field mapping via dropdown', async () => {
    const user = userEvent.setup()
    const mockConfirm = vi.fn()

    render(
      <ColumnMappingWizard
        sampleData={mockSampleData}
        requiredFields={requiredFields}
        optionalFields={optionalFields}
        onConfirm={mockConfirm}
      />
    )

    // Find the first row's select trigger
    const rows = screen.getAllByRole('row')
    const firstDataRow = rows[1] // Skip header row
    const selectTrigger = within(firstDataRow).getByRole('combobox')

    await user.click(selectTrigger)

    // Select "skip" option
    const listbox = screen.getByRole('listbox')
    const skipOption = within(listbox).getByRole('option', {
      name: /Skip this column/,
    })
    await user.click(skipOption)

    // After skipping a required field, Continue should be disabled
    const continueButton = screen.getByRole('button', {
      name: /Continue with Mapping/,
    })
    expect(continueButton).toBeDisabled()
  })

  it('validates required fields before allowing confirmation', () => {
    const mockConfirm = vi.fn()

    // Only provide one column - not enough for all required fields
    const limitedSampleData: SampleData[] = [
      {
        columnName: 'Unknown Column',
        sampleValues: ['value1', 'value2', 'value3'],
      },
    ]

    render(
      <ColumnMappingWizard
        sampleData={limitedSampleData}
        requiredFields={requiredFields}
        optionalFields={optionalFields}
        onConfirm={mockConfirm}
      />
    )

    const continueButton = screen.getByRole('button', {
      name: /Continue with Mapping/,
    })
    expect(continueButton).toBeDisabled()

    // Should show validation error
    expect(screen.getByText(/Missing required fields/)).toBeInTheDocument()
  })

  it('shows required fields marked with asterisk in dropdown', async () => {
    const user = userEvent.setup()
    const mockConfirm = vi.fn()

    render(
      <ColumnMappingWizard
        sampleData={mockSampleData}
        requiredFields={requiredFields}
        optionalFields={optionalFields}
        onConfirm={mockConfirm}
      />
    )

    const rows = screen.getAllByRole('row')
    const firstDataRow = rows[1]
    const selectTrigger = within(firstDataRow).getByRole('combobox')

    await user.click(selectTrigger)

    const listbox = screen.getByRole('listbox')

    // Required fields should have asterisks
    expect(within(listbox).getByText(/Account Code \*/)).toBeInTheDocument()
    expect(within(listbox).getByText(/Amount \*/)).toBeInTheDocument()
    expect(within(listbox).getByText(/Date \*/)).toBeInTheDocument()
  })

  it('allows skipping columns', async () => {
    const user = userEvent.setup()
    const mockConfirm = vi.fn()

    render(
      <ColumnMappingWizard
        sampleData={mockSampleData}
        requiredFields={requiredFields}
        optionalFields={optionalFields}
        onConfirm={mockConfirm}
      />
    )

    // Skip the optional "Notes" column (4th row)
    const rows = screen.getAllByRole('row')
    const notesRow = rows[4]
    const selectTrigger = within(notesRow).getByRole('combobox')

    await user.click(selectTrigger)

    const listbox = screen.getByRole('listbox')
    const skipOption = within(listbox).getByRole('option', {
      name: /Skip this column/,
    })
    await user.click(skipOption)

    // Should still be valid if all required fields are mapped
    const continueButton = screen.getByRole('button', {
      name: /Continue with Mapping/,
    })
    expect(continueButton).not.toBeDisabled()
  })

  it('calls onConfirm with mappings when Continue is clicked', async () => {
    const user = userEvent.setup()
    const mockConfirm = vi.fn()

    render(
      <ColumnMappingWizard
        sampleData={mockSampleData}
        requiredFields={requiredFields}
        optionalFields={optionalFields}
        onConfirm={mockConfirm}
      />
    )

    const continueButton = screen.getByRole('button', {
      name: /Continue with Mapping/,
    })
    await user.click(continueButton)

    expect(mockConfirm).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          sourceColumn: expect.any(String),
          targetField: expect.anything(),
        }),
      ])
    )
  })

  it('does not call onConfirm when validation fails', async () => {
    const user = userEvent.setup()
    const mockConfirm = vi.fn()

    const limitedSampleData: SampleData[] = [
      {
        columnName: 'Unknown',
        sampleValues: ['val1'],
      },
    ]

    render(
      <ColumnMappingWizard
        sampleData={limitedSampleData}
        requiredFields={requiredFields}
        optionalFields={optionalFields}
        onConfirm={mockConfirm}
      />
    )

    const continueButton = screen.getByRole('button', {
      name: /Continue with Mapping/,
    })

    // Button should be disabled
    expect(continueButton).toBeDisabled()

    // Clicking disabled button shouldn't call onConfirm
    await user.click(continueButton)
    expect(mockConfirm).not.toHaveBeenCalled()
  })

  it('shows preview when Preview Mapping button is clicked', async () => {
    const user = userEvent.setup()
    const mockConfirm = vi.fn()

    render(
      <ColumnMappingWizard
        sampleData={mockSampleData}
        requiredFields={requiredFields}
        optionalFields={optionalFields}
        onConfirm={mockConfirm}
      />
    )

    const previewButton = screen.getByRole('button', {
      name: /Preview Mapping/,
    })
    await user.click(previewButton)

    expect(screen.getByText('Mapping Preview')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Hide Preview/ })
    ).toBeInTheDocument()
  })

  it('hides preview when Hide Preview button is clicked', async () => {
    const user = userEvent.setup()
    const mockConfirm = vi.fn()

    render(
      <ColumnMappingWizard
        sampleData={mockSampleData}
        requiredFields={requiredFields}
        optionalFields={optionalFields}
        onConfirm={mockConfirm}
      />
    )

    // Show preview
    await user.click(screen.getByRole('button', { name: /Preview Mapping/ }))

    // Hide preview
    await user.click(screen.getByRole('button', { name: /Hide Preview/ }))

    expect(screen.queryByText('Mapping Preview')).not.toBeInTheDocument()
  })

  it('shows save template form when Save as Template is clicked', async () => {
    const user = userEvent.setup()
    const mockConfirm = vi.fn()
    const mockSaveTemplate = vi.fn()

    render(
      <ColumnMappingWizard
        sampleData={mockSampleData}
        requiredFields={requiredFields}
        optionalFields={optionalFields}
        onConfirm={mockConfirm}
        onSaveTemplate={mockSaveTemplate}
      />
    )

    const saveButton = screen.getByRole('button', {
      name: /Save as Template/,
    })
    await user.click(saveButton)

    expect(screen.getByText('Save Mapping Template')).toBeInTheDocument()
    expect(screen.getByLabelText('Template Name')).toBeInTheDocument()
  })

  it('calls onSaveTemplate with template name and mappings', async () => {
    const user = userEvent.setup()
    const mockConfirm = vi.fn()
    const mockSaveTemplate = vi.fn()

    render(
      <ColumnMappingWizard
        sampleData={mockSampleData}
        requiredFields={requiredFields}
        optionalFields={optionalFields}
        onConfirm={mockConfirm}
        onSaveTemplate={mockSaveTemplate}
      />
    )

    // Open save template form
    await user.click(screen.getByRole('button', { name: /Save as Template/ }))

    // Enter template name
    const nameInput = screen.getByLabelText('Template Name')
    await user.type(nameInput, 'My Custom Template')

    // Click save
    const saveButtons = screen.getAllByRole('button', { name: /Save Template/ })
    await user.click(saveButtons[0])

    expect(mockSaveTemplate).toHaveBeenCalledWith(
      'My Custom Template',
      expect.arrayContaining([
        expect.objectContaining({
          sourceColumn: expect.any(String),
        }),
      ])
    )
  })

  it('does not show save template button when onSaveTemplate is not provided', () => {
    const mockConfirm = vi.fn()

    render(
      <ColumnMappingWizard
        sampleData={mockSampleData}
        requiredFields={requiredFields}
        optionalFields={optionalFields}
        onConfirm={mockConfirm}
      />
    )

    expect(
      screen.queryByRole('button', { name: /Save as Template/ })
    ).not.toBeInTheDocument()
  })

  it('displays cancel button when onCancel is provided', () => {
    const mockConfirm = vi.fn()
    const mockCancel = vi.fn()

    render(
      <ColumnMappingWizard
        sampleData={mockSampleData}
        requiredFields={requiredFields}
        optionalFields={optionalFields}
        onConfirm={mockConfirm}
        onCancel={mockCancel}
      />
    )

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
  })

  it('calls onCancel when cancel button is clicked', async () => {
    const user = userEvent.setup()
    const mockConfirm = vi.fn()
    const mockCancel = vi.fn()

    render(
      <ColumnMappingWizard
        sampleData={mockSampleData}
        requiredFields={requiredFields}
        optionalFields={optionalFields}
        onConfirm={mockConfirm}
        onCancel={mockCancel}
      />
    )

    const cancelButton = screen.getByRole('button', { name: 'Cancel' })
    await user.click(cancelButton)

    expect(mockCancel).toHaveBeenCalled()
  })

  it('uses initial mappings when provided', () => {
    const mockConfirm = vi.fn()
    const initialMappings: ColumnMapping[] = [
      {
        sourceColumn: 'Account',
        targetField: 'account',
        confidence: 100,
      },
      {
        sourceColumn: 'Amount',
        targetField: null, // Skipped
      },
    ]

    render(
      <ColumnMappingWizard
        sampleData={mockSampleData.slice(0, 2)}
        requiredFields={requiredFields}
        optionalFields={optionalFields}
        initialMappings={initialMappings}
        onConfirm={mockConfirm}
      />
    )

    // Should use the skipped mapping - Continue should be disabled
    const continueButton = screen.getByRole('button', {
      name: /Continue with Mapping/,
    })
    expect(continueButton).toBeDisabled()
  })

  it('detects duplicate field mappings and shows error', async () => {
    const user = userEvent.setup()
    const mockConfirm = vi.fn()

    render(
      <ColumnMappingWizard
        sampleData={mockSampleData}
        requiredFields={requiredFields}
        optionalFields={optionalFields}
        onConfirm={mockConfirm}
      />
    )

    // Map two different columns to the same field
    const rows = screen.getAllByRole('row')
    const firstDataRow = rows[1]
    const secondDataRow = rows[2]

    // Change first column to "account"
    const firstSelect = within(firstDataRow).getByRole('combobox')
    await user.click(firstSelect)
    let listbox = screen.getByRole('listbox')
    await user.click(
      within(listbox).getByRole('option', { name: /Account Code/ })
    )

    // Change second column to also be "account"
    const secondSelect = within(secondDataRow).getByRole('combobox')
    await user.click(secondSelect)
    listbox = screen.getByRole('listbox')
    await user.click(
      within(listbox).getByRole('option', { name: /Account Code/ })
    )

    // Should show duplicate error
    expect(screen.getByText(/Duplicate mappings detected/)).toBeInTheDocument()
  })

  it('disables save template button when validation fails', async () => {
    const mockConfirm = vi.fn()
    const mockSaveTemplate = vi.fn()

    const limitedSampleData: SampleData[] = [
      {
        columnName: 'Unknown',
        sampleValues: ['val1'],
      },
    ]

    render(
      <ColumnMappingWizard
        sampleData={limitedSampleData}
        requiredFields={requiredFields}
        optionalFields={optionalFields}
        onConfirm={mockConfirm}
        onSaveTemplate={mockSaveTemplate}
      />
    )

    const saveButton = screen.getByRole('button', {
      name: /Save as Template/,
    })
    expect(saveButton).toBeDisabled()
  })

  it('displays only first 3 sample values per column', () => {
    const mockConfirm = vi.fn()

    render(
      <ColumnMappingWizard
        sampleData={mockSampleData}
        requiredFields={requiredFields}
        optionalFields={optionalFields}
        onConfirm={mockConfirm}
      />
    )

    // First column has 5 sample values, but should only show 3
    expect(screen.getByText('6000')).toBeInTheDocument()
    expect(screen.getByText('6100')).toBeInTheDocument()
    expect(screen.getByText('6200')).toBeInTheDocument()
    expect(screen.queryByText('7000')).not.toBeInTheDocument()
    expect(screen.queryByText('7100')).not.toBeInTheDocument()
  })
})
