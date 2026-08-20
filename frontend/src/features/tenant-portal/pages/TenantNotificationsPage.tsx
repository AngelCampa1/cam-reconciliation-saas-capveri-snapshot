/**
 * Tenant Notifications Page
 *
 * Shows tenant notification history with filtering options.
 */
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardContent } from '@/components/ui/card'
import { NotificationList } from '../components/NotificationList'

export function TenantNotificationsPage() {
  return (
    // TenantLayout already provides the <main> landmark; this page renders a
    // plain <div> so the document has a single main region.
    <div className="flex h-full flex-col px-4 py-6 md:px-6 lg:px-8">
      <PageHeader
        title="Notifications"
        description="View your activity and updates"
        showBackButton={true}
        backButtonTo="/tenant/dashboard"
      />
      <div className="flex-1">
        <Card className="mx-auto max-w-4xl">
          <CardContent className="pt-6">
            <NotificationList />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
