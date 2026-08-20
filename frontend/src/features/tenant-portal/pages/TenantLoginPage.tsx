/**
 * Tenant Portal Login Page
 *
 * Separate login page for tenant users with role verification.
 * Tenants can only access their linked leases, not full organization data.
 */

import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useAuth } from '@/hooks/useAuth'
import { UserRole } from '@/types/enums'

export function TenantLoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const auth = useAuth()

  // If already authenticated as tenant (e.g. page refresh), redirect immediately
  useEffect(() => {
    if (auth.userRole === UserRole.TENANT) {
      navigate('/tenant/dashboard')
    }
  }, [auth.userRole, navigate])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const resolvedRole = await auth.login(email, password)

      if (resolvedRole === UserRole.TENANT) {
        navigate('/tenant/dashboard')
        return
      }

      if (resolvedRole !== null) {
        setError(
          'This login is for tenant users only. Please use the main login page.'
        )
        await auth.logout()
        return
      }

      setError(
        "We couldn't sign you in. Please check your email and password, then try again."
      )
      await auth.logout()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-md shadow-md">
        <CardHeader className="space-y-1 bg-gradient-to-r from-primary/5 to-primary/10 rounded-t-lg">
          <CardTitle as="h1" className="text-2xl font-bold">
            Tenant Portal
          </CardTitle>
          <CardDescription>
            Sign in to view your lease information
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4" noValidate>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>
          <div className="mt-4 text-center text-sm">
            <Link
              to="/tenant/forgot-password"
              className="text-primary hover:underline"
            >
              Forgot password?
            </Link>
          </div>
          <div className="mt-4 pt-4 border-t text-center text-sm text-muted-foreground">
            Landlord or property manager?{' '}
            <Link to="/login" className="text-primary hover:underline">
              Sign in here
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
