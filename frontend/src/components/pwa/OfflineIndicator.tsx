/**
 * OfflineIndicator Component
 *
 * Displays a toast-style indicator when the app loses network connectivity.
 * Uses the browser's online/offline events to detect network status.
 */

import { useEffect, useState } from 'react'
import { WifiOff } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'

export function OfflineIndicator() {
  const [isOnline, setIsOnline] = useState(navigator.onLine)

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  if (isOnline) {
    return null
  }

  return (
    <div
      className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] left-4 right-4 z-modal md:bottom-4 md:left-auto md:right-4 md:max-w-sm"
      role="status"
      aria-live="polite"
      data-testid="offline-indicator"
    >
      <Alert variant="destructive" className="shadow-lg">
        <WifiOff className="h-4 w-4" />
        <AlertDescription className="ml-2">
          You are offline. Some features may not work.
        </AlertDescription>
      </Alert>
    </div>
  )
}
