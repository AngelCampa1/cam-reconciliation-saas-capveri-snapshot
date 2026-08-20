import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ReconciliationWorkflowTourSheet } from './ReconciliationWorkflowTourSheet'

describe('ReconciliationWorkflowTourSheet', () => {
  it('renders all 6 steps when open', () => {
    render(
      <ReconciliationWorkflowTourSheet open={true} onOpenChange={vi.fn()} />
    )
    expect(screen.getByText(/upload your gl file/i)).toBeInTheDocument()
    expect(screen.getByText(/upload billing statement/i)).toBeInTheDocument()
    expect(screen.getByText(/configure pool mappings/i)).toBeInTheDocument()
    expect(
      screen.getByText(/return here and click run reconciliation/i)
    ).toBeInTheDocument()
    expect(screen.getByText(/review/i)).toBeInTheDocument()
    expect(screen.getByText(/finalize/i)).toBeInTheDocument()
  })

  it('does not render step content when closed', () => {
    render(
      <ReconciliationWorkflowTourSheet open={false} onOpenChange={vi.fn()} />
    )
    expect(screen.queryByText(/upload your gl file/i)).not.toBeInTheDocument()
  })

  it('calls onOpenChange when Sheet close button clicked', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    render(
      <ReconciliationWorkflowTourSheet
        open={true}
        onOpenChange={onOpenChange}
      />
    )
    await user.click(screen.getByRole('button', { name: /close/i }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
