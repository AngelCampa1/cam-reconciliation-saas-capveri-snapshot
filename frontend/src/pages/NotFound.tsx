/**
 * 404 Not Found Page
 *
 * Displayed when users navigate to non-existent routes.
 * Features:
 * - Clear messaging
 * - Navigation to common destinations
 * - Go back button
 * - Context-aware quick links (public vs authenticated)
 */
import { useNavigate } from 'react-router-dom'
import {
  Home,
  Search,
  FileText,
  Building2,
  ArrowLeft,
  DollarSign,
  Mail,
  BookOpen,
} from 'lucide-react'
import { publicKnowledge } from '@/generated/public-knowledge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Footer } from '@/components/layout/Footer'
import { useAuth } from '@/hooks/useAuth'
import { UserRole } from '@/types/enums'
import { buildSiteUrl } from '@/lib/domains'

export function NotFoundPage() {
  const navigate = useNavigate()
  const { user, userRole } = useAuth()
  const isAuthenticated = !!user
  // Tenants live in their own portal; every landlord route (dashboard,
  // properties, ingestion) 403s them, so they need their own home + links.
  const isTenantUser = userRole === UserRole.TENANT
  const homePath = isTenantUser ? '/tenant/dashboard' : '/dashboard'

  // Quick links for landlord/PM users
  const landlordLinks = [
    {
      icon: Home,
      label: 'Dashboard',
      description: 'Return to your dashboard',
      path: '/dashboard',
    },
    {
      icon: Building2,
      label: 'Properties',
      description: 'View your properties',
      path: '/properties',
    },
    {
      icon: FileText,
      label: 'Upload Rent Roll',
      description: 'Import your latest rent roll',
      path: '/rent-roll/upload',
    },
    {
      icon: Search,
      label: 'Data Ingestion',
      description: 'Upload GL data',
      path: '/ingestion',
    },
  ]

  // Quick links for tenant-portal users (landlord routes 403 them)
  const tenantLinks = [
    {
      icon: Home,
      label: 'Dashboard',
      description: 'Return to your dashboard',
      path: '/tenant/dashboard',
    },
    {
      icon: FileText,
      label: 'Disputes',
      description: 'See your disputes',
      path: '/tenant/disputes',
    },
    {
      icon: Mail,
      label: 'Notifications',
      description: 'See your notifications',
      path: '/tenant/notifications',
    },
    {
      icon: BookOpen,
      label: 'Help',
      description: 'Get help with CapVeri',
      path: '/tenant/help',
    },
  ]

  const authenticatedLinks = isTenantUser ? tenantLinks : landlordLinks

  // Quick links for public/unauthenticated users
  const publicLinks = [
    {
      icon: Home,
      label: 'Home',
      description: 'Go to the home page',
      path: '/',
    },
    {
      icon: DollarSign,
      label: 'Pricing',
      description: 'View our pricing plans',
      path: '/pricing',
    },
    {
      icon: Mail,
      label: 'Contact',
      description: 'Get in touch with us',
      path: buildSiteUrl('/contact'),
    },
    {
      icon: BookOpen,
      label: 'Documentation',
      description: 'Learn how CapVeri works',
      path: buildSiteUrl('/resources'),
    },
  ]

  const quickLinks = isAuthenticated ? authenticatedLinks : publicLinks

  return (
    <div className="min-h-screen flex flex-col bg-muted/30">
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="max-w-2xl w-full space-y-8 text-center">
          {/* 404 Heading */}
          <div className="space-y-4">
            <h1 className="text-[clamp(4rem,15vw,8rem)] font-bold text-primary animate-fade-in-up">
              404
            </h1>
            <div
              className="space-y-2 animate-fade-in-up"
              style={{ animationDelay: '100ms' }}
            >
              <h2 className="text-2xl md:text-3xl font-semibold">
                Page Not Found
              </h2>
              <p className="text-muted-foreground max-w-md mx-auto">
                This page doesn't exist or has moved.
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div
            className="flex flex-col sm:flex-row gap-3 justify-center animate-fade-in-up"
            style={{ animationDelay: '200ms' }}
          >
            <Button
              variant="outline"
              onClick={() => {
                if (window.history.length > 1) {
                  navigate(-1)
                } else {
                  navigate(isAuthenticated ? homePath : '/')
                }
              }}
              className="gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Go Back
            </Button>
            <Button
              onClick={() => navigate(isAuthenticated ? homePath : '/')}
              className="gap-2"
            >
              <Home className="h-4 w-4" />
              {isAuthenticated ? 'Go to Dashboard' : 'Go to Home'}
            </Button>
          </div>

          {/* Quick Links */}
          <div
            className="animate-fade-in-up"
            style={{ animationDelay: '300ms' }}
          >
            <h3 className="text-sm font-medium text-muted-foreground mb-4">
              Quick Links
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {quickLinks.map((link) => {
                const Icon = link.icon
                return (
                  <Card
                    key={link.path}
                    className="cursor-pointer transition-all duration-fast hover:shadow-md hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    onClick={() => {
                      if (link.path.startsWith('http')) {
                        window.location.href = link.path
                      } else {
                        navigate(link.path)
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        if (link.path.startsWith('http')) {
                          window.location.href = link.path
                        } else {
                          navigate(link.path)
                        }
                      }
                    }}
                  >
                    <CardContent className="p-4 flex items-start gap-3 text-left">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <Icon className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-sm">{link.label}</h4>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {link.description}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </div>

          {/* Support Link */}
          <div
            className="text-sm text-muted-foreground animate-fade-in-up"
            style={{ animationDelay: '400ms' }}
          >
            Need help?{' '}
            <a
              href={publicKnowledge.contacts.byId.founder.mailto}
              className="text-primary hover:underline"
            >
              Contact Support
            </a>
          </div>
        </div>
      </div>
      <Footer variant={isAuthenticated ? 'minimal' : 'full'} />
    </div>
  )
}
