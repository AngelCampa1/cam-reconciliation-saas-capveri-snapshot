import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type React from 'react'

import { useReconciliationKickoffState } from './useReconciliationKickoffState'

vi.mock('@/api/hooks', () => ({
  useLeases: vi.fn(),
}))

vi.mock('@/features/reconciliation/hooks/useReconciliationValidation', () => ({
  useReconciliationValidation: vi.fn(),
}))

vi.mock('@/api/generated/sdk.gen', () => ({
  getLeakageApiV1LeakagePropertyIdGet: vi.fn(),
}))

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('useReconciliationKickoffState', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const hooks = await import('@/api/hooks')
    const validation =
      await import('@/features/reconciliation/hooks/useReconciliationValidation')
    const sdk = await import('@/api/generated/sdk.gen')

    vi.mocked(hooks.useLeases).mockReturnValue({
      data: { data: [], count: 0 },
      isLoading: false,
    } as never)
    vi.mocked(validation.useReconciliationValidation).mockReturnValue({
      unmappedPools: [],
      isLoading: false,
      canCalculate: true,
      warnings: [],
      mappingCounts: {},
    })
    vi.mocked(sdk.getLeakageApiV1LeakagePropertyIdGet).mockResolvedValue({
      data: {
        property_id: 'prop-1',
        period_start: '2025-01-01',
        period_end: '2025-12-31',
        capveri_calculated: '0',
        actual_billed: '0',
        leakage: '0',
        leakage_pct: 0,
        has_reconciliation_data: false,
        has_gl_data: false,
        has_billing_data: false,
        breakdown: [],
      },
    } as never)
  })

  it('returns not ready when leases and GL are missing', async () => {
    const { result } = renderHook(
      () => useReconciliationKickoffState({ propertyId: 'prop-1', year: 2025 }),
      { wrapper: createWrapper() }
    )

    expect(result.current.isReady).toBe(false)
    expect(result.current.hasLeases).toBe(false)
    expect(result.current.hasGlData).toBe(false)
  })

  it('returns ready when leases exist and GL exists', async () => {
    const hooks = await import('@/api/hooks')
    const sdk = await import('@/api/generated/sdk.gen')
    vi.mocked(hooks.useLeases).mockReturnValue({
      data: { data: [{ id: 'lease-1' }], count: 1 },
      isLoading: false,
    } as never)
    vi.mocked(sdk.getLeakageApiV1LeakagePropertyIdGet).mockResolvedValue({
      data: {
        property_id: 'prop-1',
        period_start: '2025-01-01',
        period_end: '2025-12-31',
        capveri_calculated: '0',
        actual_billed: '0',
        leakage: '0',
        leakage_pct: 0,
        has_reconciliation_data: false,
        has_gl_data: true,
        has_billing_data: false,
        breakdown: [],
      },
    } as never)

    const { result } = renderHook(
      () => useReconciliationKickoffState({ propertyId: 'prop-1', year: 2025 }),
      { wrapper: createWrapper() }
    )

    await waitFor(() => {
      expect(result.current.isReady).toBe(true)
    })
  })

  it('exposes isPaused true and refetch when leases query is paused without data', async () => {
    const hooks = await import('@/api/hooks')
    vi.mocked(hooks.useLeases).mockReturnValue({
      data: undefined,
      isLoading: false,
      isPaused: true,
      refetch: vi.fn().mockResolvedValue(undefined),
    } as never)

    const { result } = renderHook(
      () => useReconciliationKickoffState({ propertyId: 'prop-1', year: 2025 }),
      { wrapper: createWrapper() }
    )

    expect(result.current.isPaused).toBe(true)
    expect(typeof result.current.refetch).toBe('function')
  })

  it('gracefully handles leakage query errors', async () => {
    const sdk = await import('@/api/generated/sdk.gen')
    vi.mocked(sdk.getLeakageApiV1LeakagePropertyIdGet).mockResolvedValue({
      error: { detail: 'failed' },
    } as never)

    const { result } = renderHook(
      () => useReconciliationKickoffState({ propertyId: 'prop-1', year: 2025 }),
      { wrapper: createWrapper() }
    )

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
    expect(result.current.hasGlData).toBe(false)
  })
})
