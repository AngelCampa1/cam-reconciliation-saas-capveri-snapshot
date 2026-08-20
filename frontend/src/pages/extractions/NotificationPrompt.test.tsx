import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { NotificationPrompt } from './NotificationPrompt'
import * as notificationHook from '@/hooks/useNotificationPermission'

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), info: vi.fn() },
}))

function mockPermission(permission: NotificationPermission | null) {
  vi.spyOn(notificationHook, 'useNotificationPermission').mockReturnValue({
    permission,
    requestPermission: vi.fn().mockResolvedValue('default'),
    isSupported: permission !== null,
  })
}

describe('NotificationPrompt', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('renders the prompt with a dismiss control when permission is default', () => {
    mockPermission('default')
    render(<NotificationPrompt />)

    expect(
      screen.getByText(/Get notified when extractions finish/)
    ).toBeVisible()
    expect(
      screen.getByLabelText('Dismiss notification prompt')
    ).toBeInTheDocument()
  })

  it('hides the prompt and persists the dismissal when dismissed', async () => {
    const user = userEvent.setup()
    mockPermission('default')
    render(<NotificationPrompt />)

    await user.click(screen.getByLabelText('Dismiss notification prompt'))

    expect(
      screen.queryByText(/Get notified when extractions finish/)
    ).not.toBeInTheDocument()
    expect(localStorage.getItem('capveri.notificationPrompt.dismissed')).toBe(
      'true'
    )
  })

  it('stays hidden on next render once dismissed', () => {
    localStorage.setItem('capveri.notificationPrompt.dismissed', 'true')
    mockPermission('default')
    render(<NotificationPrompt />)

    expect(
      screen.queryByText(/Get notified when extractions finish/)
    ).not.toBeInTheDocument()
  })

  it('renders nothing when permission is already granted', () => {
    mockPermission('granted')
    const { container } = render(<NotificationPrompt />)
    expect(container).toBeEmptyDOMElement()
  })
})
