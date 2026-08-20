/**
 * NotificationList Component
 *
 * Displays in-app notifications for tenant users with read/unread status,
 * mark as read functionality, and navigation to related entities.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'
import { CheckCheck, Bell } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { SkeletonCard } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ErrorState } from '@/components/ErrorState'
import {
  listNotificationsApiV1TenantNotificationsGet,
  markNotificationReadApiV1TenantNotificationsNotificationIdReadPost,
  markAllNotificationsReadApiV1TenantNotificationsReadAllPost,
} from '@/api/generated/sdk.gen'
import { apiClient } from '@/api/client'
import type { TenantNotification } from '@/api/generated/types.gen'
import { EmptyState } from '@/components/EmptyState'

export function NotificationList() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const {
    data: notifications,
    isLoading,
    isPaused,
    error,
    refetch,
  } = useQuery<TenantNotification[]>({
    queryKey: ['tenant-notifications'],
    queryFn: async () => {
      const response = await listNotificationsApiV1TenantNotificationsGet({
        client: apiClient,
        query: {
          unread_only: false,
          skip: 0,
          limit: 20,
        },
      })

      if (response.error) {
        throw new Error('Failed to fetch notifications')
      }

      return response.data || []
    },
  })

  const markReadMutation = useMutation({
    mutationFn: async (id: string) => {
      const response =
        await markNotificationReadApiV1TenantNotificationsNotificationIdReadPost(
          {
            client: apiClient,
            path: { notification_id: id },
          }
        )

      if (response.error) {
        throw new Error('Failed to mark notification as read')
      }

      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-notifications'] })
      queryClient.invalidateQueries({ queryKey: ['tenant-dashboard'] })
    },
    onError: () => {
      toast.error('Failed to mark notification as read')
    },
  })

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      const response =
        await markAllNotificationsReadApiV1TenantNotificationsReadAllPost({
          client: apiClient,
        })

      if (response.error) {
        throw new Error('Failed to mark all notifications as read')
      }

      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-notifications'] })
      queryClient.invalidateQueries({ queryKey: ['tenant-dashboard'] })
    },
    onError: () => {
      toast.error('Failed to mark all notifications as read')
    },
  })

  const handleNotificationClick = (notification: TenantNotification) => {
    if (!notification.read_at) {
      markReadMutation.mutate(notification.id)
    }
    if (notification.link_url) {
      navigate(notification.link_url)
    }
  }

  // React Query's default networkMode 'online' pauses (does not error) a fetch
  // that fails with no reachable backend, leaving error null and isLoading
  // false. Without this guard the list falls through to a blank area (the
  // `notifications?.length === 0` empty state never fires for undefined data),
  // so treat a paused-with-no-data fetch as a retryable load failure.
  if (error || (isPaused && !notifications)) {
    return (
      <ErrorState
        size="sm"
        title="Couldn't load notifications"
        offline={isPaused && !notifications}
        action={{ onClick: () => refetch() }}
      />
    )
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} showImage={false} showHeader bodyLines={2} />
        ))}
      </div>
    )
  }

  const unreadCount = notifications?.filter((n) => !n.read_at).length || 0

  return (
    <div className="space-y-4">
      {unreadCount > 0 && (
        <div className="flex justify-between items-center">
          <p className="text-sm font-medium text-muted-foreground">
            {unreadCount} unread
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => markAllReadMutation.mutate()}
            disabled={markAllReadMutation.isPending}
          >
            <CheckCheck className="h-4 w-4" aria-hidden="true" />
            Mark all read
          </Button>
        </div>
      )}

      <div className="space-y-2">
        {notifications?.map((notification) => (
          <button
            key={notification.id}
            type="button"
            className={cn(
              'w-full p-4 rounded-lg border text-left shadow-sm transition-all duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
              notification.read_at
                ? 'bg-background hover:bg-muted/30 hover:shadow-sm'
                : 'bg-primary/5 border-primary/20 hover:bg-primary/10 hover:shadow-sm'
            )}
            onClick={() => handleNotificationClick(notification)}
          >
            <span className="flex justify-between items-start">
              <span className="flex-1">
                <span className="block font-medium">
                  {notification.title}
                  {!notification.read_at && (
                    <span className="sr-only"> (Unread)</span>
                  )}
                </span>
                <span className="block text-sm text-muted-foreground">
                  {notification.message}
                </span>
              </span>
              {!notification.read_at && (
                <span
                  className="h-2 w-2 bg-primary rounded-full flex-shrink-0 mt-2"
                  aria-hidden="true"
                />
              )}
            </span>
            <span className="block text-xs text-muted-foreground/70 mt-2">
              {formatDistanceToNow(new Date(notification.created_at), {
                addSuffix: true,
              })}
            </span>
          </button>
        ))}

        {notifications?.length === 0 && (
          <EmptyState
            icon={Bell}
            titleAs="h2"
            title="No notifications yet"
            description="You will see updates about your reconciliations here."
          />
        )}
      </div>
    </div>
  )
}
