import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EditInterface, type EditInterfaceProps } from './EditInterface'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { LeaseRecoveryProfile } from '@/types/lease-recovery-profile'
import type { FieldSourceReference } from './EditableField'

// Wrapper component to provide TooltipProvider
function TestWrapper({ children }: { children: React.ReactNode }) {
  return <TooltipProvider>{children}</TooltipProvider>
}

describe('EditInterface', () => {
  const mockProfile: LeaseRecoveryProfile = {
    base_year: 2020,
    base_year_amount: '50000',
    gross_up_base_year: false,
    pro_rata_share: '0.15',
    cap_type: 'cumulative',
    cap_rate: '0.03',
    admin_fee_percentage: '0.15',
    excluded_pools: [],
  }

  const mockOriginalProfile: LeaseRecoveryProfile = {
    base_year: 2019,
    base_year_amount: '45000',
    gross_up_base_year: false,
    pro_rata_share: '0.15',
    cap_type: 'none',
    cap_rate: null,
    admin_fee_percentage: '0.15',
    excluded_pools: [],
  }

  const mockSourceRefs: FieldSourceReference[] = [
    {
      field: 'base_year',
      confidence: 0.95,
      text: 'Base Year: 2020',
      page: 1,
      boundingBox: { left: 0.1, top: 0.1, width: 0.1, height: 0.02 },
    },
    {
      field: 'pro_rata_share',
      confidence: 0.85,
      text: 'Pro-rata share: 15%',
      page: 2,
      boundingBox: { left: 0.1, top: 0.2, width: 0.1, height: 0.02 },
    },
  ]

  const defaultProps: EditInterfaceProps = {
    profile: mockProfile,
    originalProfile: mockOriginalProfile,
    sourceReferences: mockSourceRefs,
    onFieldChange: vi.fn(),
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    canUndo: true,
    canRedo: false,
    onFieldFocus: vi.fn(),
  }

  describe('Rendering', () => {
    it('renders header with title', () => {
      render(
        <TestWrapper>
          <EditInterface {...defaultProps} />
        </TestWrapper>
      )

      expect(screen.getByText('Extracted Lease Terms')).toBeInTheDocument()
    })

    it('renders undo and redo buttons', () => {
      render(
        <TestWrapper>
          <EditInterface {...defaultProps} />
        </TestWrapper>
      )

      expect(screen.getByTestId('undo-button')).toBeInTheDocument()
      expect(screen.getByTestId('redo-button')).toBeInTheDocument()
    })

    it('renders all field definitions', () => {
      render(
        <TestWrapper>
          <EditInterface {...defaultProps} />
        </TestWrapper>
      )

      expect(screen.getByText('Base Year')).toBeInTheDocument()
      expect(screen.getByText('Base Year Amount')).toBeInTheDocument()
      expect(screen.getByText('Gross-Up Base Year')).toBeInTheDocument()
      expect(screen.getByText('Pro-Rata Share')).toBeInTheDocument()
      expect(screen.getByText('Cap Type')).toBeInTheDocument()
      expect(screen.getByText('Cap Rate')).toBeInTheDocument()
      expect(screen.getByText('Admin Fee')).toBeInTheDocument()
    })

    it('renders fields container', () => {
      render(
        <TestWrapper>
          <EditInterface {...defaultProps} />
        </TestWrapper>
      )

      expect(screen.getByTestId('fields-container')).toBeInTheDocument()
    })

    it('renders gross-up as a toggle and cap type as a labeled select (F-232)', () => {
      render(
        <TestWrapper>
          <EditInterface {...defaultProps} />
        </TestWrapper>
      )

      // Boolean field is a Yes/No toggle, not a raw "false" text input.
      expect(
        screen.getByRole('switch', { name: 'Gross-Up Base Year' })
      ).toBeInTheDocument()
      expect(
        screen.queryByTestId('input-gross_up_base_year')
      ).not.toBeInTheDocument()

      // Cap type shows its human label, never the raw enum value.
      expect(screen.getByTestId('select-cap_type')).toHaveTextContent(
        'Cumulative'
      )
      expect(screen.queryByText('cumulative')).not.toBeInTheDocument()
    })

    it('emits a boolean from the gross-up toggle (F-232)', async () => {
      const user = userEvent.setup()
      const onFieldChange = vi.fn()

      render(
        <TestWrapper>
          <EditInterface {...defaultProps} onFieldChange={onFieldChange} />
        </TestWrapper>
      )

      await user.click(
        screen.getByRole('switch', { name: 'Gross-Up Base Year' })
      )
      expect(onFieldChange).toHaveBeenCalledWith('gross_up_base_year', true)
    })
  })

  describe('Undo/Redo Functionality', () => {
    it('enables undo button when canUndo is true', () => {
      render(
        <TestWrapper>
          <EditInterface {...defaultProps} canUndo={true} />
        </TestWrapper>
      )

      const undoButton = screen.getByTestId('undo-button')
      expect(undoButton).not.toBeDisabled()
    })

    it('disables undo button when canUndo is false', () => {
      render(
        <TestWrapper>
          <EditInterface {...defaultProps} canUndo={false} />
        </TestWrapper>
      )

      const undoButton = screen.getByTestId('undo-button')
      expect(undoButton).toBeDisabled()
    })

    it('enables redo button when canRedo is true', () => {
      render(
        <TestWrapper>
          <EditInterface {...defaultProps} canRedo={true} />
        </TestWrapper>
      )

      const redoButton = screen.getByTestId('redo-button')
      expect(redoButton).not.toBeDisabled()
    })

    it('disables redo button when canRedo is false', () => {
      render(
        <TestWrapper>
          <EditInterface {...defaultProps} canRedo={false} />
        </TestWrapper>
      )

      const redoButton = screen.getByTestId('redo-button')
      expect(redoButton).toBeDisabled()
    })

    it('calls onUndo when undo button clicked', async () => {
      const user = userEvent.setup()
      const onUndo = vi.fn()

      render(
        <TestWrapper>
          <EditInterface {...defaultProps} onUndo={onUndo} canUndo={true} />
        </TestWrapper>
      )

      await user.click(screen.getByTestId('undo-button'))

      expect(onUndo).toHaveBeenCalledOnce()
    })

    it('calls onRedo when redo button clicked', async () => {
      const user = userEvent.setup()
      const onRedo = vi.fn()

      render(
        <TestWrapper>
          <EditInterface {...defaultProps} onRedo={onRedo} canRedo={true} />
        </TestWrapper>
      )

      await user.click(screen.getByTestId('redo-button'))

      expect(onRedo).toHaveBeenCalledOnce()
    })
  })

  describe('Field Change Handling', () => {
    it('calls onFieldChange when field value changes', async () => {
      const user = userEvent.setup()
      const onFieldChange = vi.fn()

      render(
        <TestWrapper>
          <EditInterface {...defaultProps} onFieldChange={onFieldChange} />
        </TestWrapper>
      )

      const input = screen.getByTestId('input-base_year')
      await user.type(input, '1')

      expect(onFieldChange).toHaveBeenCalled()
      expect(onFieldChange).toHaveBeenCalledWith(
        'base_year',
        expect.any(String)
      )
    })

    it('calls onFieldFocus when field is focused', async () => {
      const user = userEvent.setup()
      const onFieldFocus = vi.fn()

      render(
        <TestWrapper>
          <EditInterface {...defaultProps} onFieldFocus={onFieldFocus} />
        </TestWrapper>
      )

      const input = screen.getByTestId('input-base_year')
      await user.click(input)

      expect(onFieldFocus).toHaveBeenCalledWith('base_year')
    })
  })

  describe('Change Highlighting', () => {
    it('highlights changed fields', () => {
      render(
        <TestWrapper>
          <EditInterface {...defaultProps} />
        </TestWrapper>
      )

      // base_year is changed (2020 vs 2019)
      const baseYearField = screen.getByTestId('editable-field-base_year')
      expect(baseYearField).toHaveClass('bg-warning/10')
      expect(baseYearField).toHaveClass('border-warning/20')
    })

    it('does not highlight unchanged fields', () => {
      render(
        <TestWrapper>
          <EditInterface {...defaultProps} />
        </TestWrapper>
      )

      // pro_rata_share is unchanged (0.15 vs 0.15)
      const proRataField = screen.getByTestId('editable-field-pro_rata_share')
      expect(proRataField).not.toHaveClass('bg-warning/10')
      expect(proRataField).not.toHaveClass('border-warning/20')
    })

    it('shows original value for changed fields', () => {
      render(
        <TestWrapper>
          <EditInterface {...defaultProps} />
        </TestWrapper>
      )

      // base_year changed from 2019 to 2020
      expect(screen.getByTestId('original-value-base_year')).toBeInTheDocument()
      expect(screen.getByTestId('original-value-base_year')).toHaveTextContent(
        'Original: 2019'
      )
    })

    it('does not show original value for unchanged fields', () => {
      render(
        <TestWrapper>
          <EditInterface {...defaultProps} />
        </TestWrapper>
      )

      // pro_rata_share is unchanged
      expect(
        screen.queryByTestId('original-value-pro_rata_share')
      ).not.toBeInTheDocument()
    })
  })

  describe('Source Reference Integration', () => {
    it('shows confidence indicator for fields with source references', () => {
      render(
        <TestWrapper>
          <EditInterface {...defaultProps} />
        </TestWrapper>
      )

      // base_year has a source reference
      const baseYearField = screen.getByTestId('editable-field-base_year')
      expect(
        baseYearField.querySelector('[data-testid="confidence-badge"]')
      ).toBeInTheDocument()
    })

    it('does not show confidence indicator for fields without source references', () => {
      render(
        <TestWrapper>
          <EditInterface {...defaultProps} />
        </TestWrapper>
      )

      // base_year_amount does not have a source reference
      const amountField = screen.getByTestId('editable-field-base_year_amount')
      expect(
        amountField.querySelector('[data-testid="confidence-badge"]')
      ).not.toBeInTheDocument()
    })
  })

  describe('Confidence Filter', () => {
    it('shows all fields when confidenceFilter is "all"', () => {
      render(
        <TestWrapper>
          <EditInterface {...defaultProps} confidenceFilter="all" />
        </TestWrapper>
      )
      expect(screen.getByTestId('editable-field-base_year')).toBeInTheDocument()
      expect(
        screen.getByTestId('editable-field-pro_rata_share')
      ).toBeInTheDocument()
      expect(
        screen.getByTestId('editable-field-base_year_amount')
      ).toBeInTheDocument()
    })

    it('shows only low-confidence and unreferenced fields when confidenceFilter is "low"', () => {
      render(
        <TestWrapper>
          <EditInterface {...defaultProps} confidenceFilter="low" />
        </TestWrapper>
      )
      expect(
        screen.queryByTestId('editable-field-base_year')
      ).not.toBeInTheDocument()
      expect(
        screen.queryByTestId('editable-field-pro_rata_share')
      ).not.toBeInTheDocument()
      expect(
        screen.getByTestId('editable-field-base_year_amount')
      ).toBeInTheDocument()
    })
  })

  describe('Edge Cases', () => {
    it('handles null values', () => {
      const profileWithNulls: LeaseRecoveryProfile = {
        ...mockProfile,
        base_year: null,
        cap_rate: null,
      }

      render(
        <TestWrapper>
          <EditInterface
            {...defaultProps}
            profile={profileWithNulls}
            originalProfile={profileWithNulls}
          />
        </TestWrapper>
      )

      const baseYearInput = screen.getByTestId('input-base_year')
      expect(baseYearInput).toHaveValue('')
    })

    it('handles empty source references', () => {
      render(
        <TestWrapper>
          <EditInterface {...defaultProps} sourceReferences={[]} />
        </TestWrapper>
      )

      // Should render all fields without confidence indicators
      expect(screen.getByTestId('edit-interface')).toBeInTheDocument()
      expect(screen.queryAllByTestId('confidence-badge')).toHaveLength(0)
    })
  })

  describe('Confirm affordance wiring', () => {
    it('marks confirmed fields and calls onConfirmField when toggled', async () => {
      const user = userEvent.setup()
      const onConfirmField = vi.fn()

      render(
        <TestWrapper>
          <EditInterface
            {...defaultProps}
            confirmedFields={['admin_fee_percentage']}
            onConfirmField={onConfirmField}
          />
        </TestWrapper>
      )

      // pro_rata_share is unchanged, so its confirm toggle is shown.
      const proRataConfirm = screen.getByTestId('confirm-pro_rata_share')
      expect(proRataConfirm).toHaveAttribute('aria-pressed', 'false')

      // admin_fee_percentage is unchanged and already confirmed.
      expect(
        screen.getByTestId('confirm-admin_fee_percentage')
      ).toHaveAttribute('aria-pressed', 'true')

      await user.click(proRataConfirm)
      expect(onConfirmField).toHaveBeenCalledWith('pro_rata_share')
    })
  })

  describe('Base year adjustment money formatting (F-430)', () => {
    it('renders imputed cost via the canonical currency formatter', () => {
      const profile: LeaseRecoveryProfile = {
        ...mockProfile,
        base_year_adjustments: [
          {
            service_name: 'Security',
            imputed_amount: '5000',
            justification: 'New service post base year',
          },
        ],
      }
      render(
        <TestWrapper>
          <EditInterface {...defaultProps} profile={profile} />
        </TestWrapper>
      )
      // Raw `${imputed_amount}` would render "$5000"; formatMoney gives grouped
      // thousands + cents.
      expect(screen.getByText('$5,000.00')).toBeInTheDocument()
      expect(screen.queryByText(/Imputed cost: \$5000/)).not.toBeInTheDocument()
    })
  })
})
