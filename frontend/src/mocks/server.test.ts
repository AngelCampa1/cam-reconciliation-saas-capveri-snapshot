/**
 * Tests for MSW server setup
 *
 * Verifies that the test server is configured correctly.
 * Following test minimalism: test our wrapper logic, not MSW framework internals.
 * These tests verify exports and basic functionality without deep mocking.
 */
import { describe, it, expect, vi } from 'vitest'
import {
  server,
  mswServer,
  startServer,
  resetServer,
  stopServer,
} from './server'

describe('MSW Server Setup', () => {
  it('exports server instance', () => {
    expect(server).toBeDefined()
    expect(server).toHaveProperty('listen')
    expect(server).toHaveProperty('close')
    expect(server).toHaveProperty('resetHandlers')
  })

  it('exports server as mswServer alias', () => {
    expect(mswServer).toBe(server)
  })

  it('startServer calls server.listen', () => {
    const listenSpy = vi.spyOn(server, 'listen')
    startServer()
    expect(listenSpy).toHaveBeenCalledWith({
      onUnhandledRequest: 'warn',
    })
    listenSpy.mockRestore()
  })

  it('resetServer calls server.resetHandlers', () => {
    const resetSpy = vi.spyOn(server, 'resetHandlers')
    resetServer()
    expect(resetSpy).toHaveBeenCalled()
    resetSpy.mockRestore()
  })

  it('stopServer calls server.close', () => {
    const closeSpy = vi.spyOn(server, 'close')
    stopServer()
    expect(closeSpy).toHaveBeenCalled()
    closeSpy.mockRestore()
  })
})
