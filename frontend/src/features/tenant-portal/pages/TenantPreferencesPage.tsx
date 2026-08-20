/**
 * Tenant Preferences Page
 *
 * Allows tenants to manage their email notification preferences.
 */
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardContent } from '@/components/ui/card'
import { EmailPreferences } from '../components/EmailPreferences'

export function TenantPreferencesPage() {
  return (
    // TenantLayout already provides the <main> landmark; this page renders a
    // plain <div> so the document has a single main region.
    <div className="flex h-full flex-col px-4 py-6 md:px-6 lg:px-8">
      <PageHeader
        title="Email Preferences"
        description="Manage your notification settings"
        showBackButton={true}
        backButtonTo="/tenant/dashboard"
      />
      <div className="flex-1">
        <Card className="mx-auto max-w-2xl">
          <CardContent className="pt-6">
            <EmailPreferences />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
