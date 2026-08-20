import { useState } from 'react'
import { Bell, X } from 'lucide-react'
import { toast } from 'sonner'
import { useNotificationPermission } from '@/hooks/useNotificationPermission'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

const DISMISS_STORAGE_KEY = 'capveri.notificationPrompt.dismissed'

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

export function NotificationPrompt() {
  const { permission, requestPermission, isSupported } =
    useNotificationPermission()
  const [dismissed, setDismissed] = useState(readDismissed)

  if (!isSupported || permission !== 'default' || dismissed) return null

  const handleEnable = async () => {
    const result = await requestPermission()
    if (result === 'granted') {
      toast.success('Notifications enabled')
    } else if (result === 'denied') {
      toast.info('Notifications blocked. Enable them in your browser settings.')
    }
  }

  const handleDismiss = () => {
    setDismissed(true)
    try {
      localStorage.setItem(DISMISS_STORAGE_KEY, 'true')
    } catch {
      // Storage can be unavailable (private mode). The banner still hides for
      // this session; it may reappear next load, which is acceptable.
    }
  }

  return (
    <Card className="mb-6">
      <CardContent className="flex flex-col gap-3 py-3 px-4 sm:flex-row sm:items-center">
        <div className="flex flex-1 items-center gap-3">
          <Bell className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <p className="text-sm text-muted-foreground">
            Get notified when extractions finish, even if you navigate away
          </p>
        </div>
        <div className="flex items-center gap-2 self-end sm:self-auto">
          <Button size="sm" variant="outline" onClick={handleEnable}>
            Enable Notifications
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={handleDismiss}
            aria-label="Dismiss notification prompt"
            className="h-10 w-10 flex-shrink-0 rounded-full"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
