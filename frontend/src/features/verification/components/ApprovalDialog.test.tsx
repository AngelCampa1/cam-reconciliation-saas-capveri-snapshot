import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApprovalDialog, type EditAction } from './ApprovalDialog'
import type { LeaseRecoveryProfile } from '@/types/lease-recovery-profile'

describe('ApprovalDialog', () => {
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

  const mockEditHistory: EditAction[] = [
    {
      field: 'base_year',
      old_value: '2019',
      new_value: '2020',
      timestamp: '2024-01-01T12:00:00Z',
    },
    {
      field: 'base_year_amount',
      old_value: '45000',
      new_value: '50000',
      timestamp: '2024-01-01T12:01:00Z',
    },
    {
      field: 'cap_type',
      old_value: 'none',
      new_value: 'cumulative',
      timestamp: '2024-01-01T12:02:00Z',
    },
  ]

  describe('Rendering', () => {
    it('renders dialog when open', () => {
      render(
        <ApprovalDialog
          open={true}
          onOpenChange={vi.fn()}
          profile={mockProfile}
          originalProfile={mockOriginalProfile}
          editHistory={mockEditHistory}
          onConfirm={vi.fn()}
          isSubmitting={false}
        />
      )

      expect(screen.getByTestId('approval-dialog')).toBeInTheDocument()
      expect(
        screen.getByText('Approve & Commit Extraction')
      ).toBeInTheDocument()
      expect(
        screen.getByText('This saves the reviewed lease terms.')
      ).toBeInTheDocument()
    })

    it('does not render dialog when closed', () => {
      render(
        <ApprovalDialog
          open={false}
          onOpenChange={vi.fn()}
          profile={mockProfile}
          originalProfile={mockOriginalProfile}
          editHistory={mockEditHistory}
          onConfirm={vi.fn()}
          isSubmitting={false}
        />
      )

      expect(screen.queryByTestId('approval-dialog')).not.toBeInTheDocument()
    })

    it('renders confirm and cancel buttons', () => {
      render(
        <ApprovalDialog
          open={true}
          onOpenChange={vi.fn()}
          profile={mockProfile}
          originalProfile={mockOriginalProfile}
          editHistory={mockEditHistory}
          onConfirm={vi.fn()}
          isSubmitting={false}
        />
      )

      expect(screen.getByTestId('confirm-button')).toBeInTheDocument()
      expect(screen.getByTestId('cancel-button')).toBeInTheDocument()
    })
  })

  describe('Changes Summary', () => {
    it('displays changes summary when fields have changed', () => {
      render(
        <ApprovalDialog
          open={true}
          onOpenChange={vi.fn()}
          profile={mockProfile}
          originalProfile={mockOriginalProfile}
          editHistory={mockEditHistory}
          onConfirm={vi.fn()}
          isSubmitting={false}
        />
      )

      expect(screen.getByTestId('changes-summary')).toBeInTheDocument()
      expect(
        screen.getByText(`Changes Made (${mockEditHistory.length})`)
      ).toBeInTheDocument()
    })

    it('displays all changed fields', () => {
      render(
        <ApprovalDialog
          open={true}
          onOpenChange={vi.fn()}
          profile={mockProfile}
          originalProfile={mockOriginalProfile}
          editHistory={mockEditHistory}
          onConfirm={vi.fn()}
          isSubmitting={false}
        />
      )

      expect(screen.getByTestId('change-base_year')).toBeInTheDocument()
      expect(screen.getByTestId('change-base_year_amount')).toBeInTheDocument()
      expect(screen.getByTestId('change-cap_type')).toBeInTheDocument()
      expect(screen.getByTestId('change-cap_rate')).toBeInTheDocument()
    })

    it('shows field labels instead of raw field names', () => {
      render(
        <ApprovalDialog
          open={true}
          onOpenChange={vi.fn()}
          profile={mockProfile}
          originalProfile={mockOriginalProfile}
          editHistory={mockEditHistory}
          onConfirm={vi.fn()}
          isSubmitting={false}
        />
      )

      expect(screen.getByText('Base Year:')).toBeInTheDocument()
      expect(screen.getByText('Base Year Amount:')).toBeInTheDocument()
      expect(screen.getByText('Cap Type:')).toBeInTheDocument()
    })

    it('shows before and after values for changed fields', () => {
      render(
        <ApprovalDialog
          open={true}
          onOpenChange={vi.fn()}
          profile={mockProfile}
          originalProfile={mockOriginalProfile}
          editHistory={mockEditHistory}
          onConfirm={vi.fn()}
          isSubmitting={false}
        />
      )

      const baseYearChange = screen.getByTestId('change-base_year')
      expect(baseYearChange).toHaveTextContent('2019 → 2020')

      const amountChange = screen.getByTestId('change-base_year_amount')
      expect(amountChange).toHaveTextContent('45000 → 50000')
    })

    it('displays "no changes" message when no fields changed', () => {
      render(
        <ApprovalDialog
          open={true}
          onOpenChange={vi.fn()}
          profile={mockOriginalProfile}
          originalProfile={mockOriginalProfile}
          editHistory={[]}
          onConfirm={vi.fn()}
          isSubmitting={false}
        />
      )

      expect(screen.getByTestId('no-changes-message')).toBeInTheDocument()
      expect(
        screen.getByText(
          'No changes made. The original extraction will be saved.'
        )
      ).toBeInTheDocument()
      expect(screen.queryByTestId('changes-summary')).not.toBeInTheDocument()
    })
  })

  describe('Value Formatting', () => {
    it('formats null values as "N/A"', () => {
      const profileWithNull = {
        ...mockProfile,
        cap_rate: null,
      }
      const originalWithValue = {
        ...mockOriginalProfile,
        cap_rate: '0.03',
      }

      render(
        <ApprovalDialog
          open={true}
          onOpenChange={vi.fn()}
          profile={profileWithNull}
          originalProfile={originalWithValue}
          editHistory={mockEditHistory}
          onConfirm={vi.fn()}
          isSubmitting={false}
        />
      )

      const capRateChange = screen.getByTestId('change-cap_rate')
      expect(capRateChange).toHaveTextContent('N/A')
    })

    it('formats boolean values as Yes/No', () => {
      const profileWithTrue = {
        ...mockProfile,
        gross_up_base_year: true,
      }

      render(
        <ApprovalDialog
          open={true}
          onOpenChange={vi.fn()}
          profile={profileWithTrue}
          originalProfile={mockOriginalProfile}
          editHistory={mockEditHistory}
          onConfirm={vi.fn()}
          isSubmitting={false}
        />
      )

      const grossUpChange = screen.getByTestId('change-gross_up_base_year')
      expect(grossUpChange).toHaveTextContent('No → Yes')
    })

    it('formats arrays as comma-separated values', () => {
      const profileWithArray = {
        ...mockProfile,
        excluded_pools: ['utilities', 'janitorial'],
      }
      const originalWithEmpty = {
        ...mockOriginalProfile,
        excluded_pools: [],
      }

      render(
        <ApprovalDialog
          open={true}
          onOpenChange={vi.fn()}
          profile={profileWithArray}
          originalProfile={originalWithEmpty}
          editHistory={mockEditHistory}
          onConfirm={vi.fn()}
          isSubmitting={false}
        />
      )

      const poolsChange = screen.getByTestId('change-excluded_pools')
      expect(poolsChange).toHaveTextContent('None → utilities, janitorial')
    })
  })

  describe('User Interactions', () => {
    it('calls onConfirm when confirm button clicked', async () => {
      const user = userEvent.setup()
      const onConfirm = vi.fn().mockResolvedValue(undefined)

      render(
        <ApprovalDialog
          open={true}
          onOpenChange={vi.fn()}
          profile={mockProfile}
          originalProfile={mockOriginalProfile}
          editHistory={mockEditHistory}
          onConfirm={onConfirm}
          isSubmitting={false}
        />
      )

      await user.click(screen.getByTestId('confirm-button'))

      expect(onConfirm).toHaveBeenCalledOnce()
    })

    it('calls onOpenChange when cancel button clicked', async () => {
      const user = userEvent.setup()
      const onOpenChange = vi.fn()

      render(
        <ApprovalDialog
          open={true}
          onOpenChange={onOpenChange}
          profile={mockProfile}
          originalProfile={mockOriginalProfile}
          editHistory={mockEditHistory}
          onConfirm={vi.fn()}
          isSubmitting={false}
        />
      )

      await user.click(screen.getByTestId('cancel-button'))

      expect(onOpenChange).toHaveBeenCalledWith(false)
    })

    it('disables buttons when submitting', () => {
      render(
        <ApprovalDialog
          open={true}
          onOpenChange={vi.fn()}
          profile={mockProfile}
          originalProfile={mockOriginalProfile}
          editHistory={mockEditHistory}
          onConfirm={vi.fn()}
          isSubmitting={true}
        />
      )

      expect(screen.getByTestId('confirm-button')).toBeDisabled()
      expect(screen.getByTestId('cancel-button')).toBeDisabled()
    })

    it('shows "Approving..." text when submitting', () => {
      render(
        <ApprovalDialog
          open={true}
          onOpenChange={vi.fn()}
          profile={mockProfile}
          originalProfile={mockOriginalProfile}
          editHistory={mockEditHistory}
          onConfirm={vi.fn()}
          isSubmitting={true}
        />
      )

      expect(screen.getByText('Approving...')).toBeInTheDocument()
    })

    it('shows "Approve & Commit" text when not submitting', () => {
      render(
        <ApprovalDialog
          open={true}
          onOpenChange={vi.fn()}
          profile={mockProfile}
          originalProfile={mockOriginalProfile}
          editHistory={mockEditHistory}
          onConfirm={vi.fn()}
          isSubmitting={false}
        />
      )

      expect(screen.getByText('Approve & Commit')).toBeInTheDocument()
    })
  })

  describe('Edge Cases', () => {
    it('handles empty edit history', () => {
      render(
        <ApprovalDialog
          open={true}
          onOpenChange={vi.fn()}
          profile={mockProfile}
          originalProfile={mockOriginalProfile}
          editHistory={[]}
          onConfirm={vi.fn()}
          isSubmitting={false}
        />
      )

      expect(screen.getByText('Changes Made (0)')).toBeInTheDocument()
    })

    it('handles profile with all null values', () => {
      const nullProfile: LeaseRecoveryProfile = {
        base_year: null,
        base_year_amount: null,
        gross_up_base_year: false,
        pro_rata_share: '0',
        cap_type: 'none',
        cap_rate: null,
        admin_fee_percentage: '0',
        excluded_pools: [],
      }

      render(
        <ApprovalDialog
          open={true}
          onOpenChange={vi.fn()}
          profile={nullProfile}
          originalProfile={nullProfile}
          editHistory={[]}
          onConfirm={vi.fn()}
          isSubmitting={false}
        />
      )

      expect(screen.getByTestId('no-changes-message')).toBeInTheDocument()
    })
  })
})
