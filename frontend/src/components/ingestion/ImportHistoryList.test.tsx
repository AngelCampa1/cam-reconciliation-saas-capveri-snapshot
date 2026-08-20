import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ImportHistoryList, ImportRecord } from './ImportHistoryList'

describe('ImportHistoryList', () => {
  const mockImports: ImportRecord[] = [
    {
      id: '1',
      fileName: 'yardi-gl-jan-2024.csv',
      uploadedAt: new Date('2024-01-15T10:30:00'),
      source: 'yardi',
      rowCount: 1547,
      status: 'success',
    },
    {
      id: '2',
      fileName: 'mri-rentroll-feb-2024.xlsx',
      uploadedAt: new Date('2024-02-20T14:45:00'),
      source: 'mri',
      rowCount: 325,
      status: 'processing',
    },
    {
      id: '3',
      fileName: 'generic-data.csv',
      uploadedAt: new Date('2024-03-10T09:15:00'),
      source: 'generic',
      rowCount: 0,
      status: 'failed',
      errorMessage: 'Invalid file format',
    },
  ]

  it('renders empty state when no imports', () => {
    const mockNewImport = vi.fn()

    render(<ImportHistoryList imports={[]} onNewImport={mockNewImport} />)

    expect(screen.getByText('No imports yet')).toBeInTheDocument()
    expect(
      screen.getByText(/Upload your first file to begin importing GL data/)
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Start New Upload/ })
    ).toBeInTheDocument()
  })

  it('calls onNewImport when Start New Upload is clicked', async () => {
    const user = userEvent.setup()
    const mockNewImport = vi.fn()

    render(<ImportHistoryList imports={[]} onNewImport={mockNewImport} />)

    await user.click(screen.getByRole('button', { name: /Start New Upload/ }))

    expect(mockNewImport).toHaveBeenCalled()
  })

  it('does not show Start New Upload button when onNewImport is not provided', () => {
    render(<ImportHistoryList imports={[]} />)

    expect(
      screen.queryByRole('button', { name: /Start New Upload/ })
    ).not.toBeInTheDocument()
  })

  it('renders import history table with all imports', () => {
    render(<ImportHistoryList imports={mockImports} />)

    expect(screen.getByText('Import History')).toBeInTheDocument()
    expect(screen.getByText('yardi-gl-jan-2024.csv')).toBeInTheDocument()
    expect(screen.getByText('mri-rentroll-feb-2024.xlsx')).toBeInTheDocument()
    expect(screen.getByText('generic-data.csv')).toBeInTheDocument()
  })

  it('displays source system labels correctly', () => {
    render(<ImportHistoryList imports={mockImports} />)

    expect(screen.getByText('Yardi Voyager')).toBeInTheDocument()
    expect(screen.getByText('MRI Commercial')).toBeInTheDocument()
    expect(screen.getByText('Generic Format')).toBeInTheDocument()
  })

  it('displays formatted row counts', () => {
    const largeImport: ImportRecord = {
      id: '4',
      fileName: 'large-file.csv',
      uploadedAt: new Date(),
      source: 'yardi',
      rowCount: 1234567,
      status: 'success',
    }

    render(<ImportHistoryList imports={[largeImport]} />)

    expect(screen.getByText('1,234,567')).toBeInTheDocument()
  })

  it('displays formatted dates', () => {
    render(<ImportHistoryList imports={mockImports} />)

    // Check that date is formatted (exact format may vary by locale)
    expect(screen.getByText(/Jan 15, 2024/)).toBeInTheDocument()
  })

  it('displays success status with icon', () => {
    render(<ImportHistoryList imports={mockImports} />)

    expect(screen.getByText('Success')).toBeInTheDocument()
  })

  it('displays processing status with spinning icon', () => {
    render(<ImportHistoryList imports={mockImports} />)

    expect(screen.getByText('Processing')).toBeInTheDocument()
  })

  it('displays failed status with error message', () => {
    render(<ImportHistoryList imports={mockImports} />)

    expect(screen.getByText('Failed')).toBeInTheDocument()
    expect(screen.getByText('Invalid file format')).toBeInTheDocument()
  })

  it('filters imports by status', async () => {
    const user = userEvent.setup()

    render(<ImportHistoryList imports={mockImports} />)

    // Open filter dropdown
    const filterSelect = screen.getByRole('combobox', { name: /filter/i })
    await user.click(filterSelect)

    // Select "Success"
    const listbox = screen.getByRole('listbox')
    await user.click(within(listbox).getByRole('option', { name: 'Success' }))

    // Should only show success imports
    expect(screen.getByText('yardi-gl-jan-2024.csv')).toBeInTheDocument()
    expect(
      screen.queryByText('mri-rentroll-feb-2024.xlsx')
    ).not.toBeInTheDocument()
    expect(screen.queryByText('generic-data.csv')).not.toBeInTheDocument()
  })

  it('shows all imports when filter is set to all', async () => {
    const user = userEvent.setup()

    render(<ImportHistoryList imports={mockImports} />)

    // Filter to success first
    const filterSelect = screen.getByRole('combobox', { name: /filter/i })
    await user.click(filterSelect)
    let listbox = screen.getByRole('listbox')
    await user.click(within(listbox).getByRole('option', { name: 'Success' }))

    // Change back to all
    await user.click(filterSelect)
    listbox = screen.getByRole('listbox')
    await user.click(
      within(listbox).getByRole('option', { name: 'All Imports' })
    )

    // Should show all imports again
    expect(screen.getByText('yardi-gl-jan-2024.csv')).toBeInTheDocument()
    expect(screen.getByText('mri-rentroll-feb-2024.xlsx')).toBeInTheDocument()
    expect(screen.getByText('generic-data.csv')).toBeInTheDocument()
  })

  it('shows message when no imports match filter', async () => {
    const user = userEvent.setup()
    const successOnlyImports: ImportRecord[] = [
      {
        id: '1',
        fileName: 'test.csv',
        uploadedAt: new Date(),
        source: 'yardi',
        rowCount: 100,
        status: 'success',
      },
    ]

    render(<ImportHistoryList imports={successOnlyImports} />)

    // Filter to failed
    const filterSelect = screen.getByRole('combobox', { name: /filter/i })
    await user.click(filterSelect)
    const listbox = screen.getByRole('listbox')
    await user.click(within(listbox).getByRole('option', { name: 'Failed' }))

    expect(
      screen.getByText('No imports match the selected filter.')
    ).toBeInTheDocument()
  })

  it('calls onViewDetails when view button is clicked', async () => {
    const user = userEvent.setup()
    const mockViewDetails = vi.fn()

    render(
      <ImportHistoryList
        imports={mockImports}
        onViewDetails={mockViewDetails}
      />
    )

    const viewButtons = screen.getAllByLabelText(/^View details for /)
    await user.click(viewButtons[0])

    expect(mockViewDetails).toHaveBeenCalledWith('1')
  })

  it('does not show view button when onViewDetails is not provided', () => {
    render(<ImportHistoryList imports={mockImports} />)

    expect(
      screen.queryByLabelText(/^View details for /)
    ).not.toBeInTheDocument()
  })

  it('opens details when the filename is clicked', async () => {
    const user = userEvent.setup()
    const mockViewDetails = vi.fn()

    render(
      <ImportHistoryList
        imports={mockImports}
        onViewDetails={mockViewDetails}
      />
    )

    await user.click(
      screen.getByRole('button', { name: mockImports[0].fileName })
    )

    expect(mockViewDetails).toHaveBeenCalledWith('1')
  })

  it('renders the filename as plain text when onViewDetails is not provided', () => {
    render(<ImportHistoryList imports={mockImports} />)

    expect(
      screen.queryByRole('button', { name: mockImports[0].fileName })
    ).not.toBeInTheDocument()
    expect(screen.getByText(mockImports[0].fileName)).toBeInTheDocument()
  })

  it('shows re-upload button only for failed imports', () => {
    render(<ImportHistoryList imports={mockImports} onReupload={vi.fn()} />)

    const reuploadButtons = screen.getAllByLabelText(/Retry import for/)
    expect(reuploadButtons).toHaveLength(1) // Only one failed import
  })

  it('calls onReupload when re-upload button is clicked', async () => {
    const user = userEvent.setup()
    const mockReupload = vi.fn()

    render(
      <ImportHistoryList imports={mockImports} onReupload={mockReupload} />
    )

    const reuploadButton = screen.getByLabelText(
      'Retry import for generic-data.csv'
    )
    await user.click(reuploadButton)

    expect(mockReupload).toHaveBeenCalledWith('3') // Failed import ID
  })

  it('shows delete button for all imports', () => {
    render(<ImportHistoryList imports={mockImports} onDelete={vi.fn()} />)

    const deleteButtons = screen.getAllByLabelText(/^Delete import /)
    expect(deleteButtons).toHaveLength(3)
  })

  it('opens delete confirmation dialog when delete button is clicked', async () => {
    const user = userEvent.setup()

    render(<ImportHistoryList imports={mockImports} onDelete={vi.fn()} />)

    const deleteButtons = screen.getAllByLabelText(/^Delete import /)
    await user.click(deleteButtons[0])

    expect(screen.getByText('Delete Import')).toBeInTheDocument()
    expect(
      screen.getByText(/Are you sure you want to delete this import/)
    ).toBeInTheDocument()
  })

  it('calls onDelete when delete is confirmed', async () => {
    const user = userEvent.setup()
    const mockDelete = vi.fn()

    render(<ImportHistoryList imports={mockImports} onDelete={mockDelete} />)

    // Click delete button
    const deleteButtons = screen.getAllByLabelText(/^Delete import /)
    await user.click(deleteButtons[0])

    // Confirm deletion
    const confirmButton = screen.getByRole('button', { name: 'Delete' })
    await user.click(confirmButton)

    expect(mockDelete).toHaveBeenCalledWith('1')
  })

  it('does not call onDelete when delete is cancelled', async () => {
    const user = userEvent.setup()
    const mockDelete = vi.fn()

    render(<ImportHistoryList imports={mockImports} onDelete={mockDelete} />)

    // Click delete button
    const deleteButtons = screen.getAllByLabelText(/^Delete import /)
    await user.click(deleteButtons[0])

    // Cancel deletion
    const cancelButton = screen.getByRole('button', { name: 'Cancel' })
    await user.click(cancelButton)

    expect(mockDelete).not.toHaveBeenCalled()
  })

  it('closes delete dialog after confirmation', async () => {
    const user = userEvent.setup()

    render(<ImportHistoryList imports={mockImports} onDelete={vi.fn()} />)

    // Open dialog
    const deleteButtons = screen.getAllByLabelText(/^Delete import /)
    await user.click(deleteButtons[0])

    // Confirm
    await user.click(screen.getByRole('button', { name: 'Delete' }))

    // Dialog should be closed
    expect(screen.queryByText('Delete Import')).not.toBeInTheDocument()
  })

  it('closes delete dialog after cancellation', async () => {
    const user = userEvent.setup()

    render(<ImportHistoryList imports={mockImports} onDelete={vi.fn()} />)

    // Open dialog
    const deleteButtons = screen.getAllByLabelText(/^Delete import /)
    await user.click(deleteButtons[0])

    // Cancel
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    // Dialog should be closed
    expect(screen.queryByText('Delete Import')).not.toBeInTheDocument()
  })

  it('does not show delete button when onDelete is not provided', () => {
    render(<ImportHistoryList imports={mockImports} />)

    expect(screen.queryByLabelText(/^Delete import /)).not.toBeInTheDocument()
  })
})
