import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PoolMappingTourSheet } from './PoolMappingTourSheet'

describe('PoolMappingTourSheet', () => {
  it('renders all 5 steps when open', () => {
    render(<PoolMappingTourSheet open={true} onOpenChange={vi.fn()} />)
    expect(screen.getByText(/navigate to your property/i)).toBeInTheDocument()
    expect(
      screen.getByText(/you'll see your expense pools/i)
    ).toBeInTheDocument()
    expect(screen.getByText(/enter a.*gl account pattern/i)).toBeInTheDocument()
    expect(screen.getByText(/set.*allocation/i)).toBeInTheDocument()
    expect(screen.getByText(/repeat for each pool/i)).toBeInTheDocument()
  })

  it('does not render step content when closed', () => {
    render(<PoolMappingTourSheet open={false} onOpenChange={vi.fn()} />)
    expect(
      screen.queryByText(/navigate to your property/i)
    ).not.toBeInTheDocument()
  })

  it('calls onOpenChange when Sheet close button clicked', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    render(<PoolMappingTourSheet open={true} onOpenChange={onOpenChange} />)
    await user.click(screen.getByRole('button', { name: /close/i }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
