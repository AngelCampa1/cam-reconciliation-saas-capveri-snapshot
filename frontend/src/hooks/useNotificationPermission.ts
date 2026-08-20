import { useState } from 'react'

const isSupported = typeof window !== 'undefined' && 'Notification' in window

export function useNotificationPermission() {
  const [permission, setPermission] = useState<NotificationPermission | null>(
    isSupported ? Notification.permission : null
  )

  const requestPermission = async (): Promise<NotificationPermission> => {
    if (!isSupported) return 'denied'
    const result = await Notification.requestPermission()
    setPermission(result)
    return result
  }

  return { permission, requestPermission, isSupported }
}

export function sendBrowserNotification(
  title: string,
  options?: NotificationOptions
): void {
  if (!isSupported) return
  if (Notification.permission !== 'granted') return
  if (!document.hidden) return

  const notification = new Notification(title, options)
  notification.onclick = () => {
    window.focus()
    notification.close()
  }
}
