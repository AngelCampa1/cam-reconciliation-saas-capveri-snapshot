/**
 * Permission Denied (403) Page
 *
 * Displayed when user tries to access a route they don't have permission for.
 * Shows their current role and provides navigation options.
 */
import { useNavigate } from 'react-router-dom'
import { ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/contexts/AuthContext'
import { UserRole } from '@/types/enums'

export function PermissionDeniedPage() {
  const navigate = useNavigate()
  const { userRole } = useAuth()
  // Tenants have their own dashboard; sending them to the landlord-only
  // /dashboard would fail the role check and bounce them right back to /403.
  const isTenantUser = userRole === UserRole.TENANT
  const homePath = isTenantUser ? '/tenant/dashboard' : '/dashboard'

  return (
    <div className="flex h-screen flex-col items-center justify-center px-4">
      <ShieldAlert className="h-16 w-16 text-destructive" aria-hidden="true" />
      <h1 className="mt-4 text-3xl font-bold">Permission Denied</h1>
      <p className="mt-2 text-muted-foreground">
        You don't have permission to access this page.
      </p>
      <div className="mt-4 rounded-lg bg-muted p-4">
        <p className="text-sm">
          Your role:{' '}
          <span className="font-semibold">{userRole || 'Unknown'}</span>
        </p>
      </div>
      <div className="mt-6 flex gap-3">
        <Button onClick={() => navigate(-1)} variant="outline">
          Go Back
        </Button>
        <Button onClick={() => navigate(homePath)}>Go to Dashboard</Button>
      </div>
    </div>
  )
}
