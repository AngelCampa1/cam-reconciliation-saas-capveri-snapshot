import { useEffect, useRef, useCallback, useState } from 'react'
import type { LeaseRecoveryProfile } from '@/types/lease-recovery-profile'
import { getSession } from '@/api/client'
import { resolveApiUrl } from '@/api/url'
import { logger } from '@/lib/logger'

export interface UseAutoSaveOptions {
  /** Time in milliseconds to wait before saving (default: 2000) */
  delay?: number
  /** Whether auto-save is enabled (default: true) */
  enabled?: boolean
}

interface PendingSave {
  profile: LeaseRecoveryProfile
  serializedProfile: string
}

function serializeProfile(profile: LeaseRecoveryProfile): string {
  return JSON.stringify(profile)
}

/**
 * Auto-save hook for draft persistence.
 *
 * Automatically saves edited profile to the server after a period of
 * inactivity to prevent data loss. Uses debouncing to avoid excessive
 * API calls during rapid edits.
 *
 * Features:
 * - Debounced save (2 second delay by default)
 * - Only saves when profile is dirty (has unsaved changes)
 * - Cancels pending saves on unmount
 * - Can be disabled via options
 *
 * Story 16.6: Create Edit Interface
 *
 * @param documentId - ID of the extraction document being edited
 * @param editedProfile - Current edited profile state
 * @param isDirty - Whether there are unsaved changes
 * @param options - Configuration options
 * @returns Object with save status and manual save function
 */
export function useAutoSave(
  documentId: string,
  editedProfile: LeaseRecoveryProfile,
  isDirty: boolean,
  options: UseAutoSaveOptions = {}
) {
  const { delay = 2000, enabled = true } = options
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveInFlightRef = useRef(false)
  const activeSavePromiseRef = useRef<Promise<void> | null>(null)
  const pendingSaveRef = useRef<PendingSave | null>(null)
  const lastSavedProfileRef = useRef<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [saveError, setSaveError] = useState<Error | null>(null)

  const saveProfile = useCallback(
    async (
      profile: LeaseRecoveryProfile,
      serializedProfile = serializeProfile(profile)
    ) => {
      pendingSaveRef.current = { profile, serializedProfile }

      if (saveInFlightRef.current) {
        return activeSavePromiseRef.current ?? Promise.resolve()
      }

      const runSaveLoop = async () => {
        saveInFlightRef.current = true
        setIsSaving(true)
        setSaveError(null)

        try {
          while (pendingSaveRef.current) {
            const nextSave = pendingSaveRef.current
            pendingSaveRef.current = null

            const session = await getSession()
            const headers: HeadersInit = {
              'Content-Type': 'application/json',
            }

            if (session?.access_token) {
              headers['Authorization'] = `Bearer ${session.access_token}`
            }

            const response = await fetch(
              resolveApiUrl(`/api/v1/extractions/${documentId}/draft`),
              {
                method: 'PUT',
                headers,
                body: JSON.stringify({ profile: nextSave.profile }),
              }
            )

            if (!response.ok) {
              throw new Error(
                `Auto-save failed with status ${response.status} ${response.statusText}`.trim()
              )
            }

            lastSavedProfileRef.current = nextSave.serializedProfile
            setLastSaved(new Date())
            setSaveError(null)
          }
        } catch (error) {
          logger.error('Auto-save failed', { documentId, error })
          setSaveError(
            error instanceof Error ? error : new Error('Auto-save failed')
          )
          throw error
        } finally {
          saveInFlightRef.current = false
          activeSavePromiseRef.current = null
          setIsSaving(false)
        }
      }

      const savePromise = runSaveLoop()
      activeSavePromiseRef.current = savePromise
      return savePromise
    },
    [documentId]
  )

  const manualSave = useCallback(async () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    const serializedProfile = serializeProfile(editedProfile)
    await saveProfile(editedProfile, serializedProfile)
  }, [saveProfile, editedProfile])

  useEffect(() => {
    pendingSaveRef.current = null
    lastSavedProfileRef.current = null
    setLastSaved(null)
    setSaveError(null)
  }, [documentId])

  useEffect(() => {
    if (!enabled || !isDirty) {
      return
    }

    const serializedProfile = serializeProfile(editedProfile)
    if (lastSavedProfileRef.current === serializedProfile) {
      return
    }

    // Clear any existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }

    // Set up new timeout
    timeoutRef.current = setTimeout(() => {
      // Auto-save errors are logged but not propagated (background operation)
      saveProfile(editedProfile, serializedProfile).catch(() => {
        // Error already logged in saveProfile
      })
    }, delay)

    // Cleanup on unmount or when dependencies change
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
    }
  }, [editedProfile, isDirty, delay, enabled, saveProfile])

  return {
    isSaving,
    lastSaved,
    saveError,
    manualSave,
  }
}
