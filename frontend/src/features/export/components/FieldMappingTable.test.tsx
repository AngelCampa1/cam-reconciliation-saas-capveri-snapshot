/**
 * Tests for FieldMappingTable component.
 *
 * Verifies field mapping configuration and overrides.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FieldMappingTable } from './FieldMappingTable'
import type { FieldMapping } from '../types'

describe('FieldMappingTable', () => {
  const mockFields: FieldMapping[] = [
    {
      sourceField: 'date',
      targetField: 'Transaction Date',
      required: true,
      maxLength: 10,
    },
    {
      sourceField: 'accountCode',
      targetField: 'GL Account',
      required: true,
      maxLength: 20,
    },
    {
      sourceField: 'description',
      targetField: 'Description',
      required: false,
      transform: 'uppercase',
      defaultValue: 'N/A',
    },
  ]

  const mockOnChange = vi.fn()

  beforeEach(() => {
    mockOnChange.mockClear()
  })

  describe('Rendering', () => {
    it('renders table headers', () => {
      render(
        <FieldMappingTable
          fields={mockFields}
          overrides={[]}
          onChange={mockOnChange}
        />
      )

      expect(screen.getByText('Source Field')).toBeInTheDocument()
      expect(screen.getByText('Target Field')).toBeInTheDocument()
      expect(screen.getByText('Transform')).toBeInTheDocument()
      expect(screen.getByText('Default Value')).toBeInTheDocument()
      expect(screen.getByText('Max Length')).toBeInTheDocument()
      expect(screen.getAllByText('Required')[0]).toBeInTheDocument() // Header + badges
    })

    it('renders field mappings', () => {
      render(
        <FieldMappingTable
          fields={mockFields}
          overrides={[]}
          onChange={mockOnChange}
        />
      )

      expect(screen.getByText('date')).toBeInTheDocument()
      expect(screen.getByText('accountCode')).toBeInTheDocument()
      expect(screen.getByText('description')).toBeInTheDocument()
    })

    it('shows default values', () => {
      render(
        <FieldMappingTable
          fields={mockFields}
          overrides={[]}
          onChange={mockOnChange}
        />
      )

      const targetFields = screen
        .getAllByRole('textbox')
        .filter((el) => !el.hasAttribute('placeholder'))
      expect(targetFields[0]).toHaveValue('Transaction Date')
      expect(targetFields[1]).toHaveValue('GL Account')
      expect(targetFields[2]).toHaveValue('Description')
    })

    it('displays required badges', () => {
      render(
        <FieldMappingTable
          fields={mockFields}
          overrides={[]}
          onChange={mockOnChange}
        />
      )

      const requiredBadges = screen.getAllByText('Required')
      const optionalBadges = screen.getAllByText('Optional')

      // Header + 2 badge instances
      expect(requiredBadges.length).toBeGreaterThanOrEqual(2)
      expect(optionalBadges).toHaveLength(1)
    })
  })

  describe('F-275 accessible names', () => {
    it('target-field inputs are labelled by source field name', () => {
      render(
        <FieldMappingTable
          fields={mockFields}
          overrides={[]}
          onChange={mockOnChange}
        />
      )

      expect(
        screen.getByLabelText(/target field for date/i)
      ).toBeInTheDocument()
    })

    it('transform selects are labelled by source field name', () => {
      render(
        <FieldMappingTable
          fields={mockFields}
          overrides={[]}
          onChange={mockOnChange}
        />
      )

      expect(
        screen.getByRole('combobox', { name: /transform for date/i })
      ).toBeInTheDocument()
    })

    it('default-value inputs are labelled by source field name', () => {
      render(
        <FieldMappingTable
          fields={mockFields}
          overrides={[]}
          onChange={mockOnChange}
        />
      )

      expect(
        screen.getByLabelText(/default value for date/i)
      ).toBeInTheDocument()
    })

    it('max-length inputs are labelled by source field name', () => {
      render(
        <FieldMappingTable
          fields={mockFields}
          overrides={[]}
          onChange={mockOnChange}
        />
      )

      expect(screen.getByLabelText(/max length for date/i)).toBeInTheDocument()
    })
  })

  describe('Field Overrides', () => {
    it('updates target field on change', async () => {
      const user = userEvent.setup()
      render(
        <FieldMappingTable
          fields={mockFields}
          overrides={[]}
          onChange={mockOnChange}
        />
      )

      const targetInputs = screen
        .getAllByRole('textbox')
        .filter((el) => !el.hasAttribute('placeholder'))
      await user.type(targetInputs[0], 'd')

      // Should be called when typing
      expect(mockOnChange).toHaveBeenCalled()
      expect(mockOnChange).toHaveBeenCalledWith([
        expect.objectContaining({
          sourceField: 'date',
        }),
      ])
    })

    it('updates default value on change', async () => {
      const user = userEvent.setup()
      render(
        <FieldMappingTable
          fields={mockFields}
          overrides={[]}
          onChange={mockOnChange}
        />
      )

      const defaultInputs = screen.getAllByPlaceholderText('Optional')
      await user.type(defaultInputs[0], 'Default')

      expect(mockOnChange).toHaveBeenCalled()
    })

    it('displays existing overrides', () => {
      const overrides = [
        {
          sourceField: 'date',
          targetField: 'Custom Date',
        },
      ]

      render(
        <FieldMappingTable
          fields={mockFields}
          overrides={overrides}
          onChange={mockOnChange}
        />
      )

      const targetFields = screen.getAllByRole('textbox')
      expect(targetFields[0]).toHaveValue('Custom Date')
    })
  })

  describe('Transform Selection', () => {
    it('shows transform options', async () => {
      const user = userEvent.setup()
      render(
        <FieldMappingTable
          fields={mockFields}
          overrides={[]}
          onChange={mockOnChange}
        />
      )

      const transformSelects = screen.getAllByRole('combobox')
      await user.click(transformSelects[0])

      await waitFor(() => {
        // Options may appear multiple times in DOM, so use getAllByText
        expect(screen.getAllByText('None').length).toBeGreaterThan(0)
        expect(screen.getAllByText('Uppercase').length).toBeGreaterThan(0)
        expect(screen.getAllByText('Lowercase').length).toBeGreaterThan(0)
        expect(screen.getAllByText('Trim').length).toBeGreaterThan(0)
        expect(screen.getAllByText('Pad Left').length).toBeGreaterThan(0)
        expect(screen.getAllByText('Pad Right').length).toBeGreaterThan(0)
      })
    })

    it('updates transform on selection', async () => {
      const user = userEvent.setup()
      render(
        <FieldMappingTable
          fields={mockFields}
          overrides={[]}
          onChange={mockOnChange}
        />
      )

      const transformSelects = screen.getAllByRole('combobox')
      await user.click(transformSelects[0])

      // Wait for dropdown to open, then find and click Uppercase option by role
      await waitFor(() => {
        expect(screen.getAllByRole('option').length).toBeGreaterThan(0)
      })

      // Find the "Uppercase" option by role
      const options = screen.getAllByRole('option')
      const uppercaseOption = options.find(
        (opt) => opt.textContent === 'Uppercase'
      )
      if (uppercaseOption) {
        await user.click(uppercaseOption)
      }

      expect(mockOnChange).toHaveBeenCalledWith([
        expect.objectContaining({
          sourceField: 'date',
          transform: 'uppercase',
        }),
      ])
    })
  })

  describe('Max Length', () => {
    it('shows max length values', () => {
      render(
        <FieldMappingTable
          fields={mockFields}
          overrides={[]}
          onChange={mockOnChange}
        />
      )

      const maxLengthInputs = screen.getAllByRole('spinbutton')
      expect(maxLengthInputs[0]).toHaveValue(10)
      expect(maxLengthInputs[1]).toHaveValue(20)
    })

    it('updates max length on change', async () => {
      const user = userEvent.setup()
      render(
        <FieldMappingTable
          fields={mockFields}
          overrides={[]}
          onChange={mockOnChange}
        />
      )

      const maxLengthInputs = screen.getAllByRole('spinbutton')

      // Type into the max length field
      await user.type(maxLengthInputs[0], '5')

      // Should be called when typing
      expect(mockOnChange).toHaveBeenCalled()
      expect(mockOnChange).toHaveBeenCalledWith([
        expect.objectContaining({
          sourceField: 'date',
        }),
      ])
    })
  })
})
