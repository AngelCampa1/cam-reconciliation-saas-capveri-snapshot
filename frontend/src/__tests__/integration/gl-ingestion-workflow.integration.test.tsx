/**
 * Integration Tests: GL Ingestion → Reconciliation Workflow
 *
 * Drives REAL frontend code (the upload util, the SDK functions, and the
 * React Query hooks) against MSW handlers that mirror the REAL backend routes:
 *   POST /api/v1/ingestion/upload
 *   GET  /api/v1/ingestion/gl-date-range/{property_id}
 *   GET  /api/v1/ingestion/batches
 *   POST /api/v1/reconciliation/calculate
 *   GET  /api/v1/reconciliation/jobs/{job_id}
 *
 * Each test asserts real frontend behavior, not the mock echoing its input.
 */
import React from 'react'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import {
  resetGLIngestionStore,
  seedGLPeriods,
  setUploadAuthFailure,
} from '@/mocks/handlers'
import { apiClient } from '@/api/client'
import {
  getGlDateRangeApiV1IngestionGlDateRangePropertyIdGet,
  calculateReconciliationApiV1ReconciliationCalculatePost,
} from '@/api/generated'
import { uploadGlFile } from '@/features/reconciliation/utils/uploadGlFile'
import { useImportBatches, useCalculationJobStatus } from '@/api/hooks'

const mockPropertyId = 'prop-123'

function createGlFile(
  fileName = 'gl.csv',
  content = 'account,amount\n6000,1000'
) {
  return new File([content], fileName, { type: 'text/csv' })
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(
      QueryClientProvider,
      { client: queryClient },
      children
    )
  }
}

describe('GL Ingestion → Reconciliation Workflow Integration', () => {
  beforeEach(() => {
    resetGLIngestionStore()
  })

  afterEach(() => {
    resetGLIngestionStore()
  })

  it('uploads a GL file through uploadGlFile and returns normalized metadata', async () => {
    const result = await uploadGlFile(
      createGlFile('yardi_gl.csv'),
      mockPropertyId
    )

    expect(result.batchId).toEqual(expect.any(String))
    expect(result.batchId.length).toBeGreaterThan(0)
    expect(result.sourceSystem).toBe('generic')
    expect(result.rowCount).toBe(1247)
  })

  it('surfaces a thrown error from uploadGlFile on a 401 (no auto-retry in util)', async () => {
    // The util issues a single request; a 401 must surface as a thrown error
    // rather than being silently swallowed.
    setUploadAuthFailure(true)

    await expect(uploadGlFile(createGlFile(), mockPropertyId)).rejects.toThrow()

    // A subsequent upload (handler now past the first attempt) succeeds.
    const result = await uploadGlFile(createGlFile(), mockPropertyId)
    expect(result.rowCount).toBe(1247)
  })

  it('lists uploaded batches via the useImportBatches hook reading /ingestion/batches', async () => {
    // Two real uploads through the production upload util populate the
    // org-scoped batch store the hook reads from.
    const first = await uploadGlFile(
      createGlFile('batch-a.csv'),
      mockPropertyId
    )
    const second = await uploadGlFile(
      createGlFile('batch-b.csv'),
      mockPropertyId
    )

    const { result } = renderHook(() => useImportBatches(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    // The hook surfaces exactly the batches created by the uploads, keyed by
    // the batch_id the upload util returned (proving the list endpoint and
    // the upload endpoint are wired to the same store / real shapes).
    expect(result.current.data?.batches).toHaveLength(2)
    const batchIds = result.current.data?.batches.map(
      (b) => (b as { batch_id?: string }).batch_id
    )
    expect(batchIds).toEqual(
      expect.arrayContaining([first.batchId, second.batchId])
    )
  })

  it('reads the latest GL date range via the real SDK function', async () => {
    seedGLPeriods(mockPropertyId, [2022, 2023, 2024])

    const response = await getGlDateRangeApiV1IngestionGlDateRangePropertyIdGet(
      {
        client: apiClient,
        path: { property_id: mockPropertyId },
      }
    )

    expect(response.error).toBeUndefined()
    // Latest year wins
    expect(response.data?.year).toBe(2024)
    expect(response.data?.min_date).toBe('2024-01-01')
    expect(response.data?.max_date).toBe('2024-12-31')
  })

  it('returns a 404 from the GL date range SDK call when no GL exists', async () => {
    const response = await getGlDateRangeApiV1IngestionGlDateRangePropertyIdGet(
      {
        client: apiClient,
        path: { property_id: mockPropertyId },
      }
    )

    expect(response.data).toBeUndefined()
    expect(response.error).toBeDefined()
  })

  it('runs reconciliation calculate and polls the job to completion via the real hook', async () => {
    seedGLPeriods(mockPropertyId, [2024])

    // Kick off calculation through the real SDK function.
    const calc = await calculateReconciliationApiV1ReconciliationCalculatePost({
      client: apiClient,
      body: {
        property_id: mockPropertyId,
        period_start: '2024-01-01',
        period_end: '2024-12-31',
      },
    })

    expect(calc.error).toBeUndefined()
    const jobId = calc.data?.job_id
    expect(jobId).toEqual(expect.any(String))

    // Poll job status with the real useCalculationJobStatus hook. The hook
    // refetches on an interval while status is pending/running, so it should
    // converge to "completed".
    const { result } = renderHook(
      () => useCalculationJobStatus(jobId ?? null),
      {
        wrapper: createWrapper(),
      }
    )

    await waitFor(() => expect(result.current.data?.status).toBe('completed'), {
      timeout: 5000,
    })

    expect(result.current.data?.progress_percentage).toBe(100)
    expect(result.current.data?.snapshot_ids?.length).toBeGreaterThan(0)
    expect(result.current.data?.total_leases).toBe(5)
  })

  it('returns a 404 when calculate is requested with no GL data', async () => {
    const calc = await calculateReconciliationApiV1ReconciliationCalculatePost({
      client: apiClient,
      body: {
        property_id: mockPropertyId,
        period_start: '2024-01-01',
        period_end: '2024-12-31',
      },
    })

    expect(calc.data).toBeUndefined()
    expect(calc.error).toBeDefined()
  })
})
