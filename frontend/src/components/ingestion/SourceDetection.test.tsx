import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SourceDetection, DetectionResult } from './SourceDetection'

describe('SourceDetection', () => {
  const mockDetection: DetectionResult = {
    detectedSource: 'yardi',
    confidence: 'high',
    hints: [
      'Found "Yardi Systems" header',
      'Detected standard GL export format',
    ],
  }

  it('renders file name and title', () => {
    const mockConfirm = vi.fn()
    render(
      <SourceDetection
        detection={mockDetection}
        fileName="test-file.csv"
        onConfirm={mockConfirm}
      />
    )

    expect(screen.getByText('Source System Detection')).toBeInTheDocument()
    expect(screen.getByText('test-file.csv')).toBeInTheDocument()
  })

  it('displays detected source system', () => {
    const mockConfirm = vi.fn()
    render(
      <SourceDetection
        detection={mockDetection}
        fileName="test.csv"
        onConfirm={mockConfirm}
      />
    )

    expect(screen.getAllByText('Yardi Voyager').length).toBeGreaterThan(0)
    expect(
      screen.getAllByText('Yardi Voyager General Ledger export').length
    ).toBeGreaterThan(0)
  })

  it('displays high confidence badge with correct styling', () => {
    const mockConfirm = vi.fn()
    render(
      <SourceDetection
        detection={mockDetection}
        fileName="test.csv"
        onConfirm={mockConfirm}
      />
    )

    const badge = screen.getByText('High Confidence')
    expect(badge).toHaveClass('bg-success/10', 'text-success')
  })

  it('displays medium confidence badge with warning', () => {
    const mockConfirm = vi.fn()
    const mediumConfidence: DetectionResult = {
      ...mockDetection,
      confidence: 'medium',
    }

    render(
      <SourceDetection
        detection={mediumConfidence}
        fileName="test.csv"
        onConfirm={mockConfirm}
      />
    )

    const badge = screen.getByText('Medium Confidence')
    expect(badge).toHaveClass('bg-warning/10', 'text-warning-foreground')
    expect(
      screen.getByText(/Check that the detected source system/)
    ).toBeInTheDocument()
  })

  it('displays low confidence badge with error alert', () => {
    const mockConfirm = vi.fn()
    const lowConfidence: DetectionResult = {
      ...mockDetection,
      confidence: 'low',
    }

    render(
      <SourceDetection
        detection={lowConfidence}
        fileName="test.csv"
        onConfirm={mockConfirm}
      />
    )

    const badge = screen.getByText('Low Confidence')
    expect(badge).toHaveClass('bg-destructive/10', 'text-destructive')
    expect(
      screen.getByText(/could not identify the source format/)
    ).toBeInTheDocument()
  })

  it('displays detection hints/reasoning', () => {
    const mockConfirm = vi.fn()
    render(
      <SourceDetection
        detection={mockDetection}
        fileName="test.csv"
        onConfirm={mockConfirm}
      />
    )

    expect(screen.getByText('Detection Reasoning:')).toBeInTheDocument()
    expect(screen.getByText('Found "Yardi Systems" header')).toBeInTheDocument()
    expect(
      screen.getByText('Detected standard GL export format')
    ).toBeInTheDocument()
  })

  it('does not display hints section when hints array is empty', () => {
    const mockConfirm = vi.fn()
    const noHints: DetectionResult = {
      ...mockDetection,
      hints: [],
    }

    render(
      <SourceDetection
        detection={noHints}
        fileName="test.csv"
        onConfirm={mockConfirm}
      />
    )

    expect(screen.queryByText('Detection Reasoning:')).not.toBeInTheDocument()
  })

  it('allows manual override via dropdown', async () => {
    const user = userEvent.setup()
    const mockConfirm = vi.fn()

    render(
      <SourceDetection
        detection={mockDetection}
        fileName="test.csv"
        onConfirm={mockConfirm}
      />
    )

    const trigger = screen.getByRole('combobox')
    await user.click(trigger)

    const listbox = screen.getByRole('listbox')
    const mriOption = within(listbox).getByRole('option', {
      name: /MRI Commercial/,
    })
    await user.click(mriOption)

    expect(
      screen.getByText(/manually overridden the detected source/)
    ).toBeInTheDocument()
  })

  it('shows override message when source is changed', async () => {
    const user = userEvent.setup()
    const mockConfirm = vi.fn()

    render(
      <SourceDetection
        detection={mockDetection}
        fileName="test.csv"
        onConfirm={mockConfirm}
      />
    )

    const trigger = screen.getByRole('combobox')
    await user.click(trigger)

    const listbox = screen.getByRole('listbox')
    const genericOption = within(listbox).getByRole('option', {
      name: /Generic Format/,
    })
    await user.click(genericOption)

    expect(
      screen.getByText(
        'You have manually overridden the detected source system.'
      )
    ).toBeInTheDocument()
  })

  it('does not show override message when original source is reselected', async () => {
    const user = userEvent.setup()
    const mockConfirm = vi.fn()

    render(
      <SourceDetection
        detection={mockDetection}
        fileName="test.csv"
        onConfirm={mockConfirm}
      />
    )

    // Change to MRI
    const trigger = screen.getByRole('combobox')
    await user.click(trigger)
    let listbox = screen.getByRole('listbox')
    const mriOption = within(listbox).getByRole('option', {
      name: /MRI Commercial/,
    })
    await user.click(mriOption)

    // Change back to Yardi
    await user.click(trigger)
    listbox = screen.getByRole('listbox')
    const yardiOption = within(listbox).getByRole('option', {
      name: /Yardi Voyager/,
    })
    await user.click(yardiOption)

    expect(
      screen.queryByText(
        'You have manually overridden the detected source system.'
      )
    ).not.toBeInTheDocument()
  })

  it('calls onConfirm with detected source when continue button is clicked', async () => {
    const user = userEvent.setup()
    const mockConfirm = vi.fn()

    render(
      <SourceDetection
        detection={mockDetection}
        fileName="test.csv"
        onConfirm={mockConfirm}
      />
    )

    const continueButton = screen.getByRole('button', {
      name: /Continue with Yardi Voyager/,
    })
    await user.click(continueButton)

    expect(mockConfirm).toHaveBeenCalledWith('yardi')
  })

  it('calls onConfirm with overridden source when continue is clicked after override', async () => {
    const user = userEvent.setup()
    const mockConfirm = vi.fn()

    render(
      <SourceDetection
        detection={mockDetection}
        fileName="test.csv"
        onConfirm={mockConfirm}
      />
    )

    // Override to MRI
    const trigger = screen.getByRole('combobox')
    await user.click(trigger)
    const listbox = screen.getByRole('listbox')
    const mriOption = within(listbox).getByRole('option', {
      name: /MRI Commercial/,
    })
    await user.click(mriOption)

    // Click continue
    const continueButton = screen.getByRole('button', {
      name: /Continue with MRI Commercial/,
    })
    await user.click(continueButton)

    expect(mockConfirm).toHaveBeenCalledWith('mri')
  })

  it('displays cancel button when onCancel is provided', () => {
    const mockConfirm = vi.fn()
    const mockCancel = vi.fn()

    render(
      <SourceDetection
        detection={mockDetection}
        fileName="test.csv"
        onConfirm={mockConfirm}
        onCancel={mockCancel}
      />
    )

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
  })

  it('does not display cancel button when onCancel is not provided', () => {
    const mockConfirm = vi.fn()

    render(
      <SourceDetection
        detection={mockDetection}
        fileName="test.csv"
        onConfirm={mockConfirm}
      />
    )

    expect(
      screen.queryByRole('button', { name: 'Cancel' })
    ).not.toBeInTheDocument()
  })

  it('calls onCancel when cancel button is clicked', async () => {
    const user = userEvent.setup()
    const mockConfirm = vi.fn()
    const mockCancel = vi.fn()

    render(
      <SourceDetection
        detection={mockDetection}
        fileName="test.csv"
        onConfirm={mockConfirm}
        onCancel={mockCancel}
      />
    )

    const cancelButton = screen.getByRole('button', { name: 'Cancel' })
    await user.click(cancelButton)

    expect(mockCancel).toHaveBeenCalled()
  })

  it('displays MRI source correctly', () => {
    const mockConfirm = vi.fn()
    const mriDetection: DetectionResult = {
      detectedSource: 'mri',
      confidence: 'high',
      hints: ['Found "MRI Software" header'],
    }

    render(
      <SourceDetection
        detection={mriDetection}
        fileName="test.csv"
        onConfirm={mockConfirm}
      />
    )

    expect(screen.getAllByText('MRI Commercial').length).toBeGreaterThan(0)
    expect(
      screen.getAllByText('MRI Commercial Rent Roll export').length
    ).toBeGreaterThan(0)
  })

  it('displays generic source correctly', () => {
    const mockConfirm = vi.fn()
    const genericDetection: DetectionResult = {
      detectedSource: 'generic',
      confidence: 'low',
      hints: ['No known format detected'],
    }

    render(
      <SourceDetection
        detection={genericDetection}
        fileName="test.csv"
        onConfirm={mockConfirm}
      />
    )

    expect(screen.getAllByText('Generic Format').length).toBeGreaterThan(0)
    expect(
      screen.getAllByText(
        /Generic CSV\/Excel format \(requires manual mapping\)/
      ).length
    ).toBeGreaterThan(0)
  })

  it('continue button text updates when source is changed', async () => {
    const user = userEvent.setup()
    const mockConfirm = vi.fn()

    render(
      <SourceDetection
        detection={mockDetection}
        fileName="test.csv"
        onConfirm={mockConfirm}
      />
    )

    expect(
      screen.getByRole('button', { name: /Continue with Yardi Voyager/ })
    ).toBeInTheDocument()

    // Change to Generic
    const trigger = screen.getByRole('combobox')
    await user.click(trigger)
    const listbox = screen.getByRole('listbox')
    const genericOption = within(listbox).getByRole('option', {
      name: /Generic Format/,
    })
    await user.click(genericOption)

    expect(
      screen.getByRole('button', { name: /Continue with Generic Format/ })
    ).toBeInTheDocument()
  })

  it('does not show alert for high confidence detection', () => {
    const mockConfirm = vi.fn()

    render(
      <SourceDetection
        detection={mockDetection}
        fileName="test.csv"
        onConfirm={mockConfirm}
      />
    )

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows all three source options in dropdown', async () => {
    const user = userEvent.setup()
    const mockConfirm = vi.fn()

    render(
      <SourceDetection
        detection={mockDetection}
        fileName="test.csv"
        onConfirm={mockConfirm}
      />
    )

    const trigger = screen.getByRole('combobox')
    await user.click(trigger)

    const listbox = screen.getByRole('listbox')
    expect(
      within(listbox).getByRole('option', { name: /Yardi Voyager/ })
    ).toBeInTheDocument()
    expect(
      within(listbox).getByRole('option', { name: /MRI Commercial/ })
    ).toBeInTheDocument()
    expect(
      within(listbox).getByRole('option', { name: /Generic Format/ })
    ).toBeInTheDocument()
  })
})
