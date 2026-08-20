/**
 * useExitIntent --- Detects exit intent on the registration page.
 *
 * Triggers on:
 * - Desktop: mouse leaves viewport via top edge (clientY <= 0)
 * - Mobile: tab/app switch (visibilitychange -†’ document.hidden)
 * - Idle: configurable timeout of no interaction
 *
 * Suppressed when:
 * - User is actively filling a form (formRef element has focus)
 * - Already shown this session (sessionStorage one-shot)
 */
import { useState, useEffect, useCallback, type RefObject } from 'react'

const STORAGE_KEY = 'exit-intent-shown'

interface UseExitIntentOptions {
  idleTimeout?: number
  formRef?: RefObject<HTMLFormElement | null>
}

interface UseExitIntentReturn {
  triggered: boolean
  dismiss: () => void
}

export function useExitIntent(
  options: UseExitIntentOptions = {}
): UseExitIntentReturn {
  const { idleTimeout = 60_000, formRef } = options
  const [triggered, setTriggered] = useState(false)

  const alreadyShown = useCallback(
    () => sessionStorage.getItem(STORAGE_KEY) === '1',
    []
  )

  const isFormFocused = useCallback(() => {
    if (!formRef?.current) return false
    return formRef.current.contains(document.activeElement)
  }, [formRef])

  const trigger = useCallback(() => {
    if (alreadyShown() || isFormFocused()) return
    sessionStorage.setItem(STORAGE_KEY, '1')
    setTriggered(true)
  }, [alreadyShown, isFormFocused])

  const dismiss = useCallback(() => {
    setTriggered(false)
  }, [])

  useEffect(() => {
    // Mouse leave handler (desktop --- cursor exits via top of viewport)
    const handleMouseLeave = (e: MouseEvent) => {
      if (e.clientY <= 0) {
        trigger()
      }
    }

    // Visibility change handler (mobile --- tab/app switch)
    const handleVisibilityChange = () => {
      if (document.hidden) {
        trigger()
      }
    }

    // Idle timer
    let idleTimer: ReturnType<typeof setTimeout> | null = null

    const resetIdleTimer = () => {
      if (idleTimer) clearTimeout(idleTimer)
      if (sessionStorage.getItem(STORAGE_KEY) === '1') return
      idleTimer = setTimeout(trigger, idleTimeout)
    }

    // Start idle timer
    resetIdleTimer()

    // Interaction events that reset idle timer
    const interactionEvents = [
      'mousemove',
      'keydown',
      'scroll',
      'touchstart',
    ] as const
    const handleInteraction = () => resetIdleTimer()

    // Attach listeners
    document.documentElement.addEventListener('mouseleave', handleMouseLeave)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    for (const event of interactionEvents) {
      document.addEventListener(event, handleInteraction)
    }

    return () => {
      document.documentElement.removeEventListener(
        'mouseleave',
        handleMouseLeave
      )
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      for (const event of interactionEvents) {
        document.removeEventListener(event, handleInteraction)
      }
      if (idleTimer) clearTimeout(idleTimer)
    }
  }, [trigger, idleTimeout])

  return { triggered, dismiss }
}
