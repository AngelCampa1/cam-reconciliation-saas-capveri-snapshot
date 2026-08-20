/**
 * Tests for PoolCopyDialog component.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TooltipProvider } from '@/components/ui/tooltip'
import { PoolCopyDialog } from './PoolCopyDialog'
import * as usePoolCopyModule from '../hooks/usePoolCopy'

// Mock the usePoolCopy hook
const mockMutate = vi.fn()
vi.mock('../hooks/usePoolCopy', () => ({
  usePoolCopy: vi.fn(),
}))

// Create wrapper with QueryClient
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>{children}</TooltipProvider>
      </QueryClientProvider>
    )
  }
}

const mockProperties = [
  { id: 'prop-1', name: 'Property 1' },
  { id: 'prop-2', name: 'Property 2' },
  { id: 'prop-3', name: 'Property 3' },
]

describe('PoolCopyDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Set up default mock implementation
    vi.mocked(usePoolCopyModule.usePoolCopy).mockReturnValue({
      mutate: mockMutate,
      reset: vi.fn(),
      isPending: false,
      isError: false,
      isSuccess: false,
      error: null,
      data: undefined,
    } as any)
  })

  it('renders copy dialog', () => {
    const onOpenChange = vi.fn()

    render(
      <PoolCopyDialog
        open={true}
        onOpenChange={onOpenChange}
        properties={mockProperties}
      />,
      { wrapper: createWrapper() }
    )

    expect(screen.getByText('Copy Expense Pools')).toBeInTheDocument()
    expect(screen.getByText(/copy expense pool structure/i)).toBeInTheDocument()
  })

  it('allows selecting source and target properties', async () => {
    const onOpenChange = vi.fn()
    const user = userEvent.setup()

    render(
      <PoolCopyDialog
        open={true}
        onOpenChange={onOpenChange}
        properties={mockProperties}
      />,
      { wrapper: createWrapper() }
    )

    // Select source property
    const sourceSelect = screen.getByRole('combobox', {
      name: /source property/i,
    })
    await user.click(sourceSelect)
    await user.click(screen.getByRole('option', { name: 'Property 1' }))

    // Select target property
    const targetSelect = screen.getByRole('combobox', {
      name: /target property/i,
    })
    await user.click(targetSelect)
    await user.click(screen.getByRole('option', { name: 'Property 2' }))

    expect(screen.getByRole('button', { name: /copy pools/i })).toBeEnabled()
  })

  it('copies pools successfully in merge mode', async () => {
    const onOpenChange = vi.fn()
    const onSuccessCallback = vi.fn()

    // Capture the onSuccess callback when mutate is called
    mockMutate.mockImplementation((_request, options) => {
      if (options?.onSuccess) {
        onSuccessCallback.mockImplementation(options.onSuccess)
      }
    })

    const user = userEvent.setup()

    render(
      <PoolCopyDialog
        open={true}
        onOpenChange={onOpenChange}
        properties={mockProperties}
        currentPropertyId="prop-1"
      />,
      { wrapper: createWrapper() }
    )

    // Select target property
    const targetSelect = screen.getByRole('combobox', {
      name: /target property/i,
    })
    await user.click(targetSelect)
    await user.click(screen.getByRole('option', { name: 'Property 2' }))

    // Click copy button
    await user.click(screen.getByRole('button', { name: /copy pools/i }))

    // Verify mutate was called with correct parameters
    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledWith(
        {
          source_property_id: 'prop-1',
          target_property_id: 'prop-2',
          copy_mode: 'merge',
        },
        expect.objectContaining({
          onSuccess: expect.any(Function),
        })
      )
    })
  })

  describe('Validation', () => {
    it('disables copy button when source property not selected', () => {
      const onOpenChange = vi.fn()

      render(
        <PoolCopyDialog
          open={true}
          onOpenChange={onOpenChange}
          properties={mockProperties}
        />,
        { wrapper: createWrapper() }
      )

      const copyButton = screen.getByRole('button', { name: /copy pools/i })
      expect(copyButton).toBeDisabled()
    })

    it('disables copy button when target property not selected', async () => {
      const onOpenChange = vi.fn()
      const user = userEvent.setup()

      render(
        <PoolCopyDialog
          open={true}
          onOpenChange={onOpenChange}
          properties={mockProperties}
        />,
        { wrapper: createWrapper() }
      )

      // Select only source property
      const sourceSelect = screen.getByRole('combobox', {
        name: /source property/i,
      })
      await user.click(sourceSelect)
      await user.click(screen.getByRole('option', { name: 'Property 1' }))

      const copyButton = screen.getByRole('button', { name: /copy pools/i })
      expect(copyButton).toBeDisabled()
    })

    it('shows validation alert when source and target are the same', async () => {
      const onOpenChange = vi.fn()
      const user = userEvent.setup()

      render(
        <PoolCopyDialog
          open={true}
          onOpenChange={onOpenChange}
          properties={mockProperties}
        />,
        { wrapper: createWrapper() }
      )

      // Set target first (no restriction when source is empty)
      const targetSelect = screen.getByRole('combobox', {
        name: /target property/i,
      })
      await user.click(targetSelect)
      const targetOption = await screen.findByRole(
        'option',
        { name: 'Property 1' },
        { timeout: 5000 }
      )
      await user.click(targetOption)

      // Now set source to the same property - triggers same-property state
      const sourceSelect = screen.getByRole('combobox', {
        name: /source property/i,
      })
      await user.click(sourceSelect)
      const sourceOption = await screen.findByRole(
        'option',
        { name: 'Property 1' },
        { timeout: 5000 }
      )
      await user.click(sourceOption)

      // Validation alert should appear
      await waitFor(() => {
        expect(
          screen.getByText(/source and target properties must be different/i)
        ).toBeInTheDocument()
      })

      const copyButton = screen.getByRole('button', { name: /copy pools/i })
      expect(copyButton).toBeDisabled()
    })

    it('disables target property option when it matches source', async () => {
      const onOpenChange = vi.fn()
      const user = userEvent.setup()

      render(
        <PoolCopyDialog
          open={true}
          onOpenChange={onOpenChange}
          properties={mockProperties}
        />,
        { wrapper: createWrapper() }
      )

      // Select source property
      const sourceSelect = screen.getByRole('combobox', {
        name: /source property/i,
      })
      await user.click(sourceSelect)
      const sourceOption = await screen.findByRole(
        'option',
        { name: 'Property 1' },
        { timeout: 5000 }
      )
      await user.click(sourceOption)

      // Open target select
      const targetSelect = screen.getByRole('combobox', {
        name: /target property/i,
      })
      await user.click(targetSelect)

      // Try to click the disabled Property 1 option
      // This should NOT change the targetPropertyId state because it's disabled
      const disabledOption = await screen.findByRole(
        'option',
        { name: 'Property 1' },
        { timeout: 5000 }
      )
      await user.click(disabledOption)

      // Verify state didn't change (placeholder still shown)
      await waitFor(() => {
        expect(targetSelect).toHaveTextContent('Select target property')
      })

      // Verify validation alert is NOT shown (because target is still empty)
      expect(
        screen.queryByText(/source and target properties must be different/i)
      ).not.toBeInTheDocument()
    })
  })

  describe('Copy Mode', () => {
    it('defaults to merge mode', () => {
      const onOpenChange = vi.fn()

      render(
        <PoolCopyDialog
          open={true}
          onOpenChange={onOpenChange}
          properties={mockProperties}
        />,
        { wrapper: createWrapper() }
      )

      const mergeRadio = screen.getByRole('radio', { name: /merge/i })
      expect(mergeRadio).toBeChecked()
    })

    it('allows changing copy mode to replace', async () => {
      const onOpenChange = vi.fn()
      const user = userEvent.setup()

      render(
        <PoolCopyDialog
          open={true}
          onOpenChange={onOpenChange}
          properties={mockProperties}
        />,
        { wrapper: createWrapper() }
      )

      const replaceRadio = screen.getByRole('radio', { name: /replace/i })
      await user.click(replaceRadio)

      expect(replaceRadio).toBeChecked()
    })

    it('sends replace mode in mutation request', async () => {
      const onOpenChange = vi.fn()
      const user = userEvent.setup()

      render(
        <PoolCopyDialog
          open={true}
          onOpenChange={onOpenChange}
          properties={mockProperties}
          currentPropertyId="prop-1"
        />,
        { wrapper: createWrapper() }
      )

      // Change to replace mode
      const replaceRadio = screen.getByRole('radio', { name: /replace/i })
      await user.click(replaceRadio)

      // Select target property
      const targetSelect = screen.getByRole('combobox', {
        name: /target property/i,
      })
      await user.click(targetSelect)
      await user.click(screen.getByRole('option', { name: 'Property 2' }))

      // Click copy button
      await user.click(screen.getByRole('button', { name: /copy pools/i }))

      // Replace mode requires explicit confirmation before mutating
      const confirmButton = await screen.findByRole('button', {
        name: /replace pools/i,
      })
      await user.click(confirmButton)

      // Verify mutate was called with replace mode
      await waitFor(() => {
        expect(mockMutate).toHaveBeenCalledWith(
          {
            source_property_id: 'prop-1',
            target_property_id: 'prop-2',
            copy_mode: 'replace',
          },
          expect.any(Object)
        )
      })
    })

    it('does not mutate in replace mode until confirmation is given', async () => {
      const onOpenChange = vi.fn()
      const user = userEvent.setup()

      render(
        <PoolCopyDialog
          open={true}
          onOpenChange={onOpenChange}
          properties={mockProperties}
          currentPropertyId="prop-1"
        />,
        { wrapper: createWrapper() }
      )

      const replaceRadio = screen.getByRole('radio', { name: /replace/i })
      await user.click(replaceRadio)

      const targetSelect = screen.getByRole('combobox', {
        name: /target property/i,
      })
      await user.click(targetSelect)
      await user.click(screen.getByRole('option', { name: 'Property 2' }))

      await user.click(screen.getByRole('button', { name: /copy pools/i }))

      // Confirmation dialog is shown and nothing has mutated yet
      expect(
        await screen.findByRole('alertdialog', { name: /replace all pools/i })
      ).toBeInTheDocument()
      expect(mockMutate).not.toHaveBeenCalled()
    })
  })

  describe('Error Handling', () => {
    it('shows error alert when copy fails', () => {
      const onOpenChange = vi.fn()

      vi.mocked(usePoolCopyModule.usePoolCopy).mockReturnValue({
        mutate: mockMutate,
        reset: vi.fn(),
        isPending: false,
        isError: true,
        isSuccess: false,
        error: { message: 'Network error occurred' } as any,
        data: undefined,
      } as any)

      render(
        <PoolCopyDialog
          open={true}
          onOpenChange={onOpenChange}
          properties={mockProperties}
        />,
        { wrapper: createWrapper() }
      )

      expect(screen.getByText('Network error occurred')).toBeInTheDocument()
    })

    it('shows default error message when error has no message', () => {
      const onOpenChange = vi.fn()

      vi.mocked(usePoolCopyModule.usePoolCopy).mockReturnValue({
        mutate: mockMutate,
        reset: vi.fn(),
        isPending: false,
        isError: true,
        isSuccess: false,
        error: {} as any,
        data: undefined,
      } as any)

      render(
        <PoolCopyDialog
          open={true}
          onOpenChange={onOpenChange}
          properties={mockProperties}
        />,
        { wrapper: createWrapper() }
      )

      expect(
        screen.getByText(/failed to copy pools\. please try again/i)
      ).toBeInTheDocument()
    })
  })

  describe('Success State', () => {
    it('shows success alert with singular pool count', () => {
      const onOpenChange = vi.fn()

      vi.mocked(usePoolCopyModule.usePoolCopy).mockReturnValue({
        mutate: mockMutate,
        reset: vi.fn(),
        isPending: false,
        isError: false,
        isSuccess: true,
        error: null,
        data: { pools_copied: 1, pools_deleted: 0 },
      } as any)

      render(
        <PoolCopyDialog
          open={true}
          onOpenChange={onOpenChange}
          properties={mockProperties}
        />,
        { wrapper: createWrapper() }
      )

      expect(
        screen.getByText(/successfully copied 1 pool/i)
      ).toBeInTheDocument()
    })

    it('shows success alert with plural pool count', () => {
      const onOpenChange = vi.fn()

      vi.mocked(usePoolCopyModule.usePoolCopy).mockReturnValue({
        mutate: mockMutate,
        reset: vi.fn(),
        isPending: false,
        isError: false,
        isSuccess: true,
        error: null,
        data: { pools_copied: 5, pools_deleted: 0 },
      } as any)

      render(
        <PoolCopyDialog
          open={true}
          onOpenChange={onOpenChange}
          properties={mockProperties}
        />,
        { wrapper: createWrapper() }
      )

      expect(
        screen.getByText(/successfully copied 5 pools/i)
      ).toBeInTheDocument()
    })

    it('shows deleted pools info with singular count', () => {
      const onOpenChange = vi.fn()

      vi.mocked(usePoolCopyModule.usePoolCopy).mockReturnValue({
        mutate: mockMutate,
        reset: vi.fn(),
        isPending: false,
        isError: false,
        isSuccess: true,
        error: null,
        data: { pools_copied: 3, pools_deleted: 1 },
      } as any)

      render(
        <PoolCopyDialog
          open={true}
          onOpenChange={onOpenChange}
          properties={mockProperties}
        />,
        { wrapper: createWrapper() }
      )

      expect(
        screen.getByText(
          /successfully copied 3 pools. deleted 1 existing pool/i
        )
      ).toBeInTheDocument()
    })

    it('shows deleted pools info with plural count', () => {
      const onOpenChange = vi.fn()

      vi.mocked(usePoolCopyModule.usePoolCopy).mockReturnValue({
        mutate: mockMutate,
        reset: vi.fn(),
        isPending: false,
        isError: false,
        isSuccess: true,
        error: null,
        data: { pools_copied: 5, pools_deleted: 3 },
      } as any)

      render(
        <PoolCopyDialog
          open={true}
          onOpenChange={onOpenChange}
          properties={mockProperties}
        />,
        { wrapper: createWrapper() }
      )

      expect(
        screen.getByText(
          /successfully copied 5 pools. deleted 3 existing pools/i
        )
      ).toBeInTheDocument()
    })

    it('closes dialog on success and resets form', async () => {
      const onOpenChange = vi.fn()
      const user = userEvent.setup()

      // Mock mutation to trigger onSuccess
      mockMutate.mockImplementation((_request, options) => {
        if (options?.onSuccess) {
          options.onSuccess({ pools_copied: 3, pools_deleted: 0 })
        }
      })

      render(
        <PoolCopyDialog
          open={true}
          onOpenChange={onOpenChange}
          properties={mockProperties}
          currentPropertyId="prop-1"
        />,
        { wrapper: createWrapper() }
      )

      // Select target property
      const targetSelect = screen.getByRole('combobox', {
        name: /target property/i,
      })
      await user.click(targetSelect)
      await user.click(screen.getByRole('option', { name: 'Property 2' }))

      // Change copy mode
      const replaceRadio = screen.getByRole('radio', { name: /replace/i })
      await user.click(replaceRadio)

      // Click copy button
      await user.click(screen.getByRole('button', { name: /copy pools/i }))

      // Replace mode requires explicit confirmation before mutating
      const confirmButton = await screen.findByRole('button', {
        name: /replace pools/i,
      })
      await user.click(confirmButton)

      // Dialog should close
      await waitFor(() => {
        expect(onOpenChange).toHaveBeenCalledWith(false)
      })
    })
  })

  describe('Loading State', () => {
    it('disables copy button while pending', () => {
      const onOpenChange = vi.fn()

      vi.mocked(usePoolCopyModule.usePoolCopy).mockReturnValue({
        mutate: mockMutate,
        reset: vi.fn(),
        isPending: true,
        isError: false,
        isSuccess: false,
        error: null,
        data: undefined,
      } as any)

      render(
        <PoolCopyDialog
          open={true}
          onOpenChange={onOpenChange}
          properties={mockProperties}
          currentPropertyId="prop-1"
        />,
        { wrapper: createWrapper() }
      )

      const copyButton = screen.getByRole('button', { name: /copying/i })
      expect(copyButton).toBeDisabled()
    })

    it('shows "Copying..." text while pending', () => {
      const onOpenChange = vi.fn()

      vi.mocked(usePoolCopyModule.usePoolCopy).mockReturnValue({
        mutate: mockMutate,
        reset: vi.fn(),
        isPending: true,
        isError: false,
        isSuccess: false,
        error: null,
        data: undefined,
      } as any)

      render(
        <PoolCopyDialog
          open={true}
          onOpenChange={onOpenChange}
          properties={mockProperties}
          currentPropertyId="prop-1"
        />,
        { wrapper: createWrapper() }
      )

      expect(
        screen.getByRole('button', { name: /copying\.\.\./i })
      ).toBeInTheDocument()
    })

    it('disables cancel button while pending', () => {
      const onOpenChange = vi.fn()

      vi.mocked(usePoolCopyModule.usePoolCopy).mockReturnValue({
        mutate: mockMutate,
        reset: vi.fn(),
        isPending: true,
        isError: false,
        isSuccess: false,
        error: null,
        data: undefined,
      } as any)

      render(
        <PoolCopyDialog
          open={true}
          onOpenChange={onOpenChange}
          properties={mockProperties}
          currentPropertyId="prop-1"
        />,
        { wrapper: createWrapper() }
      )

      const cancelButton = screen.getByRole('button', { name: /cancel/i })
      expect(cancelButton).toBeDisabled()
    })
  })

  describe('Dialog Controls', () => {
    it('calls onOpenChange when cancel clicked', async () => {
      const onOpenChange = vi.fn()
      const user = userEvent.setup()

      render(
        <PoolCopyDialog
          open={true}
          onOpenChange={onOpenChange}
          properties={mockProperties}
        />,
        { wrapper: createWrapper() }
      )

      const cancelButton = screen.getByRole('button', { name: /cancel/i })
      await user.click(cancelButton)

      expect(onOpenChange).toHaveBeenCalledWith(false)
    })

    it('initializes source property from currentPropertyId', () => {
      const onOpenChange = vi.fn()

      render(
        <PoolCopyDialog
          open={true}
          onOpenChange={onOpenChange}
          properties={mockProperties}
          currentPropertyId="prop-2"
        />,
        { wrapper: createWrapper() }
      )

      // Source select should have prop-2 preselected
      const sourceSelect = screen.getByRole('combobox', {
        name: /source property/i,
      })
      expect(sourceSelect).toHaveTextContent('Property 2')
    })
  })
})
