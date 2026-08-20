/**
 * Tests for ExplicitChargesEditor and the draftsToCharges mapper.
 *
 * Covers add/remove/edit row interactions, the empty state, and every branch of
 * the draft-to-API conversion (blank-row drop, blank-amount default, trimming,
 * blank-name null).
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useState } from 'react'
import {
  ExplicitChargesEditor,
  draftsToCharges,
  type ChargeDraft,
} from './ExplicitChargesEditor'

/** Controlled harness so onChange updates flow back into the editor. */
function Harness({
  initial = [] as ChargeDraft[],
}: {
  initial?: ChargeDraft[]
}) {
  const [charges, setCharges] = useState<ChargeDraft[]>(initial)
  return <ExplicitChargesEditor charges={charges} onChange={setCharges} />
}

describe('ExplicitChargesEditor', () => {
  it('shows the empty-state prompt when there are no rows', () => {
    render(<Harness />)
    expect(
      screen.getByText(
        'Add a row for each tenant charge from the other system.'
      )
    ).toBeInTheDocument()
  })

  it('adds a row when "Add charge" is clicked', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: /Add charge/i }))
    expect(screen.getByLabelText('Tenant name')).toBeInTheDocument()
    expect(screen.getByLabelText('Amount charged')).toBeInTheDocument()
  })

  it('edits the name and amount of a row', () => {
    render(<Harness initial={[{ tenantName: '', amount: '' }]} />)

    const nameInput = screen.getByLabelText('Tenant name')
    fireEvent.change(nameInput, { target: { value: 'Acme Corp' } })
    expect(nameInput).toHaveValue('Acme Corp')

    const amountInput = screen.getByLabelText('Amount charged')
    fireEvent.change(amountInput, { target: { value: '1100.00' } })
    expect(amountInput).toHaveValue('1100.00')
  })

  it('removes a row when its remove button is clicked', () => {
    render(
      <Harness
        initial={[
          { tenantName: 'Acme', amount: '100' },
          { tenantName: 'Beta', amount: '200' },
        ]}
      />
    )
    expect(screen.getAllByLabelText('Tenant name')).toHaveLength(2)

    fireEvent.click(screen.getByRole('button', { name: 'Remove charge row 1' }))

    const remaining = screen.getAllByLabelText('Tenant name')
    expect(remaining).toHaveLength(1)
    expect(remaining[0]).toHaveValue('Beta')
  })

  it('calls onChange with a fresh blank row on add', () => {
    const onChange = vi.fn()
    render(<ExplicitChargesEditor charges={[]} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /Add charge/i }))
    expect(onChange).toHaveBeenCalledWith([{ tenantName: '', amount: '' }])
  })

  it('clears hidden lease bindings when the tenant name changes', () => {
    const onChange = vi.fn()
    render(
      <ExplicitChargesEditor
        charges={[
          {
            leaseId: 'lease-1',
            tenantName: 'Acme',
            poolId: 'pool-1',
            amount: '100',
          },
        ]}
        onChange={onChange}
      />
    )

    fireEvent.change(screen.getByLabelText('Tenant name'), {
      target: { value: 'Beta' },
    })

    expect(onChange).toHaveBeenCalledWith([
      {
        leaseId: null,
        tenantName: 'Beta',
        poolId: null,
        amount: '100',
      },
    ])
  })
})

describe('draftsToCharges', () => {
  it('drops fully-blank rows', () => {
    const result = draftsToCharges([
      { tenantName: '', amount: '' },
      { tenantName: '   ', amount: '   ' },
    ])
    expect(result).toEqual([])
  })

  it('defaults a blank amount to "0" while keeping the name', () => {
    const result = draftsToCharges([{ tenantName: 'Acme', amount: '' }])
    expect(result).toEqual([{ tenant_name: 'Acme', amount: '0' }])
  })

  it('trims surrounding whitespace from name and amount', () => {
    const result = draftsToCharges([
      { tenantName: '  Acme Corp  ', amount: '  1100.00  ' },
    ])
    expect(result).toEqual([{ tenant_name: 'Acme Corp', amount: '1100.00' }])
  })

  it('maps a blank name to null when an amount is present', () => {
    const result = draftsToCharges([{ tenantName: '', amount: '50' }])
    expect(result).toEqual([{ tenant_name: null, amount: '50' }])
  })

  it('keeps lease and pool identifiers for resolved rows', () => {
    const result = draftsToCharges([
      {
        leaseId: ' lease-1 ',
        tenantName: '  Acme  ',
        poolId: ' pool-1 ',
        amount: ' 75.00 ',
      },
    ])
    expect(result).toEqual([
      {
        lease_id: 'lease-1',
        tenant_name: 'Acme',
        pool_id: 'pool-1',
        amount: '75.00',
      },
    ])
  })
})
