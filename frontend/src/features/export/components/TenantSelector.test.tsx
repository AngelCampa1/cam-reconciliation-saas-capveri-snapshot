/**
 * Tests for TenantSelector component.
 *
 * Verifies tenant selection with checkboxes and select all/deselect all functionality.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TenantSelector } from './TenantSelector'
import type { TenantInfo } from '../types'

describe('TenantSelector', () => {
  const mockTenants: TenantInfo[] = [
    { id: '1', name: 'Acme Corp', suiteNumber: '101' },
    { id: '2', name: 'Widget Inc', suiteNumber: '202' },
    { id: '3', name: 'Global Services' },
  ]

  const mockOnChange = vi.fn()

  beforeEach(() => {
    mockOnChange.mockClear()
  })

  describe('Rendering', () => {
    it('renders tenant list', () => {
      render(
        <TenantSelector
          tenants={mockTenants}
          selected={[]}
          onChange={mockOnChange}
        />
      )

      expect(screen.getByText('Acme Corp')).toBeInTheDocument()
      expect(screen.getByText('Suite 101')).toBeInTheDocument()
      expect(screen.getByText('Widget Inc')).toBeInTheDocument()
      expect(screen.getByText('Suite 202')).toBeInTheDocument()
      expect(screen.getByText('Global Services')).toBeInTheDocument()
    })

    it('shows selection count', () => {
      render(
        <TenantSelector
          tenants={mockTenants}
          selected={['1', '2']}
          onChange={mockOnChange}
        />
      )

      expect(screen.getByText('2 of 3 selected')).toBeInTheDocument()
    })

    it('shows empty state when no tenants', () => {
      render(
        <TenantSelector tenants={[]} selected={[]} onChange={mockOnChange} />
      )

      expect(
        screen.getByText('No tenants available for export.')
      ).toBeInTheDocument()
    })
  })

  describe('Select All', () => {
    it('selects all tenants when clicking select all', async () => {
      const user = userEvent.setup()
      render(
        <TenantSelector
          tenants={mockTenants}
          selected={[]}
          onChange={mockOnChange}
        />
      )

      const selectAllCheckbox = screen.getByLabelText('Select All Tenants')
      await user.click(selectAllCheckbox)

      expect(mockOnChange).toHaveBeenCalledWith(['1', '2', '3'])
    })

    it('deselects all tenants when all are selected', async () => {
      const user = userEvent.setup()
      render(
        <TenantSelector
          tenants={mockTenants}
          selected={['1', '2', '3']}
          onChange={mockOnChange}
        />
      )

      const selectAllCheckbox = screen.getByLabelText('Select All Tenants')
      await user.click(selectAllCheckbox)

      expect(mockOnChange).toHaveBeenCalledWith([])
    })

    it('checks select all when all tenants are selected', () => {
      render(
        <TenantSelector
          tenants={mockTenants}
          selected={['1', '2', '3']}
          onChange={mockOnChange}
        />
      )

      const selectAllCheckbox = screen.getByLabelText('Select All Tenants')
      expect(selectAllCheckbox).toBeChecked()
    })

    it('shows mixed state when some tenants are selected', () => {
      render(
        <TenantSelector
          tenants={mockTenants}
          selected={['1', '2']}
          onChange={mockOnChange}
        />
      )

      const selectAllCheckbox = screen.getByLabelText('Select All Tenants')
      expect(selectAllCheckbox).toHaveAttribute('aria-checked', 'mixed')
    })
  })

  describe('Individual Selection', () => {
    it('selects individual tenant', async () => {
      const user = userEvent.setup()
      render(
        <TenantSelector
          tenants={mockTenants}
          selected={[]}
          onChange={mockOnChange}
        />
      )

      // Use test ID since label text is split by span
      const tenantCheckbox = screen.getByRole('checkbox', {
        name: /Acme Corp/i,
      })
      await user.click(tenantCheckbox)

      expect(mockOnChange).toHaveBeenCalledWith(['1'])
    })

    it('deselects individual tenant', async () => {
      const user = userEvent.setup()
      render(
        <TenantSelector
          tenants={mockTenants}
          selected={['1', '2']}
          onChange={mockOnChange}
        />
      )

      const tenantCheckbox = screen.getByRole('checkbox', {
        name: /Acme Corp/i,
      })
      await user.click(tenantCheckbox)

      expect(mockOnChange).toHaveBeenCalledWith(['2'])
    })

    it('adds to existing selection', async () => {
      const user = userEvent.setup()
      render(
        <TenantSelector
          tenants={mockTenants}
          selected={['1']}
          onChange={mockOnChange}
        />
      )

      const tenantCheckbox = screen.getByRole('checkbox', {
        name: /Widget Inc/i,
      })
      await user.click(tenantCheckbox)

      expect(mockOnChange).toHaveBeenCalledWith(['1', '2'])
    })

    it('checks selected tenants', () => {
      const { container } = render(
        <TenantSelector
          tenants={mockTenants}
          selected={['1', '3']}
          onChange={mockOnChange}
        />
      )

      const checkbox1 = container.querySelector('#tenant-1')
      const checkbox2 = container.querySelector('#tenant-2')
      const checkbox3 = container.querySelector('#tenant-3')

      expect(checkbox1).toBeChecked()
      expect(checkbox2).not.toBeChecked()
      expect(checkbox3).toBeChecked()
    })
  })
})
