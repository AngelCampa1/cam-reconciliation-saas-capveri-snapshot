/**
 * Tests for ExportGuide collapsible banner component.
 *
 * Written BEFORE implementation (TDD red phase).
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { ExportGuide } from './ExportGuide'

const renderGuide = (type: 'rent-roll' | 'gl' | 'cam-billed') =>
  render(
    <BrowserRouter>
      <ExportGuide type={type} />
    </BrowserRouter>
  )

describe('ExportGuide', () => {
  describe('Initial state', () => {
    it('renders collapsed by default — tab panel not visible', () => {
      renderGuide('gl')
      // The tabs content area should not be in document (or hidden)
      expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
    })

    it('shows a toggle button with "Not sure how to get this file" text', () => {
      renderGuide('gl')
      expect(
        screen.getByRole('button', { name: /not sure how to get this file/i })
      ).toBeInTheDocument()
    })
  })

  describe('Toggle behaviour', () => {
    it('button starts with aria-expanded=false', () => {
      renderGuide('gl')
      expect(
        screen.getByRole('button', { name: /not sure how to get this file/i })
      ).toHaveAttribute('aria-expanded', 'false')
    })

    it('expands when toggle is clicked and aria-expanded becomes true', async () => {
      const user = userEvent.setup()
      renderGuide('gl')
      const toggle = screen.getByRole('button', {
        name: /not sure how to get this file/i,
      })
      await user.click(toggle)
      expect(screen.getByRole('tablist')).toBeInTheDocument()
      expect(toggle).toHaveAttribute('aria-expanded', 'true')
    })

    it('collapses again when toggle is clicked a second time', async () => {
      const user = userEvent.setup()
      renderGuide('gl')
      const toggle = screen.getByRole('button', {
        name: /not sure how to get this file/i,
      })
      await user.click(toggle)
      expect(screen.getByRole('tablist')).toBeInTheDocument()
      await user.click(toggle)
      expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
    })
  })

  describe('Tabs', () => {
    it('shows all four system tabs when open', async () => {
      const user = userEvent.setup()
      renderGuide('rent-roll')
      await user.click(
        screen.getByRole('button', { name: /not sure how to get this file/i })
      )
      expect(screen.getByRole('tab', { name: /yardi/i })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: /mri/i })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: /appfolio/i })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: /realpage/i })).toBeInTheDocument()
    })

    it('defaults to the Yardi tab', async () => {
      const user = userEvent.setup()
      renderGuide('rent-roll')
      await user.click(
        screen.getByRole('button', { name: /not sure how to get this file/i })
      )
      const yardiTab = screen.getByRole('tab', { name: /yardi/i })
      expect(yardiTab).toHaveAttribute('data-state', 'active')
    })

    it('switches to MRI tab content when MRI is clicked', async () => {
      const user = userEvent.setup()
      renderGuide('rent-roll')
      await user.click(
        screen.getByRole('button', { name: /not sure how to get this file/i })
      )
      await user.click(screen.getByRole('tab', { name: /mri/i }))
      // MRI rent-roll tip mentions suite/tenant/square footage
      expect(screen.getByText(/suite number/i)).toBeInTheDocument()
    })

    it('switches to AppFolio tab content when AppFolio is clicked', async () => {
      const user = userEvent.setup()
      renderGuide('rent-roll')
      await user.click(
        screen.getByRole('button', { name: /not sure how to get this file/i })
      )
      await user.click(screen.getByRole('tab', { name: /appfolio/i }))
      expect(screen.getByText(/customize/i)).toBeInTheDocument()
    })

    it('switches to RealPage tab content when RealPage is clicked', async () => {
      const user = userEvent.setup()
      renderGuide('rent-roll')
      await user.click(
        screen.getByRole('button', { name: /not sure how to get this file/i })
      )
      await user.click(screen.getByRole('tab', { name: /realpage/i }))
      expect(screen.getByText(/onesite/i)).toBeInTheDocument()
    })
  })

  describe('Content per type', () => {
    it('rent-roll: Yardi tip mentions Rent Roll with Lease Charges', async () => {
      const user = userEvent.setup()
      renderGuide('rent-roll')
      await user.click(
        screen.getByRole('button', { name: /not sure how to get this file/i })
      )
      expect(
        screen.getByText(/Rent Roll with Lease Charges/i)
      ).toBeInTheDocument()
    })

    it('gl: Yardi tip mentions General Ledger Analytics', async () => {
      const user = userEvent.setup()
      renderGuide('gl')
      await user.click(
        screen.getByRole('button', { name: /not sure how to get this file/i })
      )
      expect(screen.getByText(/General Ledger Analytics/i)).toBeInTheDocument()
    })

    it('cam-billed: Yardi tip mentions CAM Reconciliation', async () => {
      const user = userEvent.setup()
      renderGuide('cam-billed')
      await user.click(
        screen.getByRole('button', { name: /not sure how to get this file/i })
      )
      expect(screen.getByText(/CAM Reconciliation/i)).toBeInTheDocument()
    })
  })

  describe('Plain-English file label inside the panel', () => {
    it('names the tenant list for rent-roll type', async () => {
      const user = userEvent.setup()
      renderGuide('rent-roll')
      await user.click(
        screen.getByRole('button', { name: /not sure how to get this file/i })
      )
      expect(screen.getByText(/a tenant list/i)).toBeInTheDocument()
    })

    it('names the list of what you spent for gl type', async () => {
      const user = userEvent.setup()
      renderGuide('gl')
      await user.click(
        screen.getByRole('button', { name: /not sure how to get this file/i })
      )
      expect(screen.getByText(/a list of what you spent/i)).toBeInTheDocument()
    })

    it('names last year’s shared-cost bills for cam-billed type', async () => {
      const user = userEvent.setup()
      renderGuide('cam-billed')
      await user.click(
        screen.getByRole('button', { name: /not sure how to get this file/i })
      )
      expect(
        screen.getByText(/last year’s shared-cost bills/i)
      ).toBeInTheDocument()
    })
  })

  describe('Full guide link', () => {
    it('has correct href pointing to /resources/export-guide with anchor', async () => {
      const user = userEvent.setup()
      renderGuide('gl')
      await user.click(
        screen.getByRole('button', { name: /not sure how to get this file/i })
      )
      const link = screen.getByRole('link', { name: /view full guide/i })
      expect(link).toHaveAttribute(
        'href',
        expect.stringContaining('/resources/export-guide')
      )
    })

    it('opens in a new tab with noopener noreferrer', async () => {
      const user = userEvent.setup()
      renderGuide('gl')
      await user.click(
        screen.getByRole('button', { name: /not sure how to get this file/i })
      )
      const link = screen.getByRole('link', { name: /view full guide/i })
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    })
  })
})
