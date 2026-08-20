/**
 * Tests for application entry point
 *
 * Verifies auth configuration and QueryClient setup.
 * Does not test ReactDOM rendering (framework responsibility).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { mockTrackEvent } = vi.hoisted(() => ({
  mockTrackEvent: vi.fn(),
}))

const mockToastError = vi.fn()
vi.mock('sonner', () => ({
  toast: {
    error: mockToastError,
  },
}))

// Mock createCorrelationId
const mockCreateCorrelationId = vi.fn()
vi.mock('./lib/correlationId', () => ({
  createCorrelationId: mockCreateCorrelationId,
}))

vi.mock('./lib/analytics', () => ({
  getAnalyticsErrorCategory: vi.fn((error: { statusCode?: number }) =>
    error?.statusCode === 408 ? 'timeout' : 'unknown'
  ),
  getAnalyticsErrorName: vi.fn((error: Error) => error.name || 'UnknownError'),
  getAnalyticsKeyGroup: vi.fn((key: unknown) =>
    Array.isArray(key) && typeof key[0] === 'string' ? key[0] : 'unknown'
  ),
  trackEvent: mockTrackEvent,
}))

// Mock logger
const mockDebug = vi.fn()
const mockWarn = vi.fn()
vi.mock('./lib/logger', () => ({
  logger: {
    debug: mockDebug,
    warn: mockWarn,
  },
}))

// Mock configureAuth - capture the config object
let capturedAuthConfig: any = null
const mockConfigureAuth = vi.fn((config: any) => {
  capturedAuthConfig = config
})
vi.mock('./api/client', () => ({
  configureAuth: mockConfigureAuth,
}))

// Mock Supabase
const mockGetSession = vi.fn()
const mockSignOut = vi.fn()
vi.mock('./lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: mockGetSession,
      signOut: mockSignOut,
    },
  },
}))

// Mock ReactDOM
const mockRender = vi.fn()
const mockCreateRoot = vi.fn(() => ({
  render: mockRender,
}))
vi.mock('react-dom/client', () => ({
  default: {
    createRoot: mockCreateRoot,
  },
}))

// Mock App component
vi.mock('./App', () => ({
  default: () => null,
}))

const MockPostHogProvider = vi.fn(
  ({ children }: { children: React.ReactNode }) => children
)
vi.mock('@posthog/react', () => ({
  PostHogProvider: MockPostHogProvider,
}))

// Mock Sentry and service worker registration side effects
const mockInitSentry = vi.fn()
const mockCaptureUnexpectedError = vi.fn()
const mockShouldReportError = vi.fn(() => true)
vi.mock('./lib/sentry', () => ({
  initSentry: mockInitSentry,
  captureUnexpectedError: mockCaptureUnexpectedError,
  shouldReportError: mockShouldReportError,
}))

const mockRegisterSW = vi.fn()
vi.mock('virtual:pwa-register', () => ({
  registerSW: mockRegisterSW,
}))

// Mock hooks and components
vi.mock('./hooks/useTheme', () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
}))

vi.mock('./components/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => children,
}))

async function importMain() {
  await import('./main')
  await vi.dynamicImportSettled()
}

describe('main.tsx', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mockTrackEvent.mockClear()
    mockShouldReportError.mockReturnValue(true)
    capturedAuthConfig = null
    delete (globalThis as Record<string, unknown>).__capveriAppBootstrapped__
    // Mock DOM element
    document.getElementById = vi.fn(() => document.createElement('div'))
  })

  afterEach(() => {
    vi.resetModules()
  })

  it('creates correlation ID on initialization', async () => {
    await importMain()
    expect(mockCreateCorrelationId).toHaveBeenCalledOnce()
  })

  it('configures auth with getSession and signOut callbacks', async () => {
    await importMain()

    expect(mockConfigureAuth).toHaveBeenCalledOnce()
    expect(mockConfigureAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        getSession: expect.any(Function),
        signOut: expect.any(Function),
      })
    )
  })

  it('getSession returns null when no Supabase session', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: null },
      error: null,
    })

    await importMain()

    // Call the captured getSession function
    const result = await capturedAuthConfig.getSession()
    expect(result).toBeNull()
  })

  it('getSession transforms Supabase session to API format', async () => {
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'test-token',
          refresh_token: 'test-refresh',
          expires_at: 1234567890,
          user: { id: 'user-1', email: 'test@example.com' },
        },
      },
      error: null,
    })

    await importMain()

    const result = await capturedAuthConfig.getSession()
    expect(result).toEqual({
      access_token: 'test-token',
      refresh_token: 'test-refresh',
      expires_at: 1234567890,
      user: {
        id: 'user-1',
        email: 'test@example.com',
      },
    })
  })

  it('signOut calls Supabase auth.signOut', async () => {
    await importMain()

    await capturedAuthConfig.signOut()
    expect(mockSignOut).toHaveBeenCalledOnce()
  })

  it('logs debug information during getSession', async () => {
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'test-token',
          expires_at: 1234567890,
          user: { id: 'user-1', email: 'test@example.com' },
        },
      },
      error: null,
    })

    await importMain()

    await capturedAuthConfig.getSession()

    expect(mockDebug).toHaveBeenCalledWith('API Client getSession called', {
      hasSession: true,
    })
    expect(mockDebug).toHaveBeenCalledWith('API Client session details', {
      expiresAt: 1234567890,
      userEmail: 'test@example.com',
    })
  })

  it('renders app with correct provider hierarchy', async () => {
    await importMain()

    expect(mockRender).toHaveBeenCalledOnce()
    // Verify render was called with React elements
    const renderCall = mockRender.mock.calls[0][0]
    expect(renderCall).toBeDefined()
  })

  it('uses the Capveri.com PostHog project token with masked journey capture when env key is unset', async () => {
    vi.stubEnv('VITE_POSTHOG_KEY', '')
    vi.stubEnv('VITE_POSTHOG_HOST', '')
    // Pin the opt-out off so a local .env.local VITE_DISABLE_ANALYTICS=1 can't
    // flip this assertion; CI has no .env.local so the default is already unset.
    vi.stubEnv('VITE_DISABLE_ANALYTICS', '')

    await importMain()

    const renderTree = mockRender.mock.calls[0][0]

    function findElementByType(element: any, target: any): any | null {
      if (!element || typeof element !== 'object') return null
      if (element.type === target) return element
      const children = element.props?.children
      if (!children) return null
      if (Array.isArray(children)) {
        for (const child of children) {
          const found = findElementByType(child, target)
          if (found) return found
        }
        return null
      }
      return findElementByType(children, target)
    }

    const provider = findElementByType(renderTree, MockPostHogProvider)
    expect(provider?.props).toEqual(
      expect.objectContaining({
        apiKey: 'phc_REPLACE_WITH_POSTHOG_PROJECT_KEY',
        options: expect.objectContaining({
          api_host: 'https://us.i.posthog.com',
          defaults: '2025-05-24',
          capture_pageview: false,
          autocapture: true,
          rageclick: true,
          mask_all_element_attributes: true,
          session_recording: expect.objectContaining({
            maskAllInputs: true,
            maskTextSelector: expect.stringContaining('[data-ph-mask]'),
            blockSelector: '[data-ph-block], .ph-no-capture',
          }),
        }),
      })
    )
  })

  it('omits the PostHog provider when analytics are disabled via VITE_DISABLE_ANALYTICS', async () => {
    vi.stubEnv('VITE_POSTHOG_KEY', '')
    vi.stubEnv('VITE_DISABLE_ANALYTICS', '1')

    await importMain()

    const renderTree = mockRender.mock.calls[0][0]

    function findElementByType(element: any, target: any): any | null {
      if (!element || typeof element !== 'object') return null
      if (element.type === target) return element
      const children = element.props?.children
      if (!children) return null
      if (Array.isArray(children)) {
        for (const child of children) {
          const found = findElementByType(child, target)
          if (found) return found
        }
        return null
      }
      return findElementByType(children, target)
    }

    expect(findElementByType(renderTree, MockPostHogProvider)).toBeNull()
  })

  it('allows bootstrap to retry after an initialization failure', async () => {
    const mainModule = await import('./main')
    await vi.dynamicImportSettled()
    mainModule.resetBootstrapForTests()

    mockInitSentry.mockClear()
    mockRender.mockClear()
    mockCreateRoot.mockClear()
    mockInitSentry.mockImplementationOnce(() => {
      throw new Error('Sentry init failed')
    })

    expect(() => mainModule.bootstrapApp()).toThrow('Sentry init failed')
    expect(mockRender).not.toHaveBeenCalled()

    expect(() => mainModule.bootstrapApp()).not.toThrow()
    expect(mockInitSentry).toHaveBeenCalledTimes(2)
    expect(mockCreateRoot).toHaveBeenCalledOnce()
    expect(mockRender).toHaveBeenCalledOnce()
  })

  it('tracks background query failures with safe PostHog properties', async () => {
    const mainModule = await import('./main')
    await vi.dynamicImportSettled()

    mainModule.trackBackgroundQueryFailure(
      Object.assign(new Error('Request timed out'), { statusCode: 408 }),
      {
        queryKey: ['properties', 'prop-123'],
        state: { data: { id: 1 } },
      } as any
    )

    expect(mockTrackEvent).toHaveBeenCalledWith('app_background_query_failed', {
      query_group: 'properties',
      error_name: 'Error',
      error_category: 'timeout',
      has_cached_data: true,
    })
  })

  it('reports first-load query failures to Sentry without user toast noise', async () => {
    const mainModule = await import('./main')
    await vi.dynamicImportSettled()

    const error = Object.assign(new Error('Server failed'), { statusCode: 500 })
    mainModule.handleQueryFailure(error, {
      queryKey: ['subscription'],
      state: { data: undefined },
    } as any)

    expect(mockCaptureUnexpectedError).toHaveBeenCalledWith(error, {
      operation: 'react-query.initial-query',
      path: '/',
    })
    expect(mockTrackEvent).not.toHaveBeenCalledWith(
      'app_background_query_failed',
      expect.anything()
    )
    expect(mockToastError).not.toHaveBeenCalled()
  })

  it('does not report expected first-load query failures', async () => {
    mockShouldReportError.mockReturnValue(false)
    const mainModule = await import('./main')
    await vi.dynamicImportSettled()

    const error = new Error('Authentication required')
    mainModule.handleQueryFailure(error, {
      queryKey: ['invoices'],
      state: { data: undefined },
    } as any)

    expect(mockCaptureUnexpectedError).not.toHaveBeenCalled()
    expect(mockTrackEvent).not.toHaveBeenCalledWith(
      'app_background_query_failed',
      expect.anything()
    )
    expect(mockToastError).not.toHaveBeenCalled()
  })

  it('does not report statusless query wrapper errors that may be expected 4xx', async () => {
    const mainModule = await import('./main')
    await vi.dynamicImportSettled()

    const error = new Error('Failed to fetch properties')
    mainModule.handleQueryFailure(error, {
      queryKey: ['properties'],
      state: { data: undefined },
    } as any)

    expect(mockCaptureUnexpectedError).not.toHaveBeenCalled()
    expect(mockToastError).not.toHaveBeenCalled()
  })

  it('reports browser network query failures', async () => {
    const mainModule = await import('./main')
    await vi.dynamicImportSettled()

    const error = new TypeError('Failed to fetch')
    mainModule.handleQueryFailure(error, {
      queryKey: ['properties'],
      state: { data: undefined },
    } as any)

    expect(mockCaptureUnexpectedError).toHaveBeenCalledWith(error, {
      operation: 'react-query.initial-query',
      path: '/',
    })
    expect(mockToastError).not.toHaveBeenCalled()
  })

  it('keeps background query toast and analytics while reporting to Sentry', async () => {
    const mainModule = await import('./main')
    await vi.dynamicImportSettled()

    const error = Object.assign(new Error('Server failed'), { statusCode: 500 })
    mainModule.handleQueryFailure(error, {
      queryKey: ['properties', 'prop-123'],
      state: { data: { id: 1 } },
    } as any)

    expect(mockCaptureUnexpectedError).toHaveBeenCalledWith(error, {
      operation: 'react-query.background-query',
      path: '/',
    })
    expect(mockTrackEvent).toHaveBeenCalledWith('app_background_query_failed', {
      query_group: 'properties',
      error_name: 'Error',
      error_category: 'unknown',
      has_cached_data: true,
    })
    expect(mockToastError).toHaveBeenCalledWith('Server failed')
  })

  it('tracks mutation failures with safe PostHog properties', async () => {
    const mainModule = await import('./main')
    await vi.dynamicImportSettled()

    mainModule.trackMutationFailure(new Error('Save failed'), {
      options: { mutationKey: ['lease-save', 'lease-123'] },
    } as any)

    expect(mockTrackEvent).toHaveBeenCalledWith('app_mutation_failed', {
      mutation_group: 'lease-save',
      error_name: 'Error',
      error_category: 'unknown',
    })
  })
})
