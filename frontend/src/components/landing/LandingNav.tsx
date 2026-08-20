/**
 * Landing Navigation Component
 *
 * Simple navigation bar for the landing page with logo, links, and CTAs.
 */
import { useState, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Menu, X, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Logo } from '@/components/ui/logo'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'

const navLinks = [
  { label: 'How It Works', href: '/#how-it-works', isHash: true },
  { label: 'Value Check', href: '/#roi-calculator', isHash: true },
  { label: 'Tools', href: '/tools', isHash: false },
  { label: 'Resources', href: '/resources', isHash: false },
  { label: 'Pricing', href: '/pricing', isHash: false },
  { label: 'About', href: '/about', isHash: false },
  { label: 'Contact', href: '/contact', isHash: false },
]

export interface LandingNavProps {
  /** Additional CSS classes */
  className?: string
  /** @deprecated No longer used - theme is determined automatically */
  variant?: 'light'
}

export function LandingNav({ className }: LandingNavProps) {
  const { user } = useAuth()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()

  // Close mobile menu on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && mobileMenuOpen) {
        setMobileMenuOpen(false)
      }
    }

    if (mobileMenuOpen) {
      document.addEventListener('keydown', handleEscape)
      return () => document.removeEventListener('keydown', handleEscape)
    }
  }, [mobileMenuOpen])

  // Handle hash link navigation with smooth scroll
  const handleHashLink = (hash: string) => (e: React.MouseEvent) => {
    e.preventDefault()

    // Remove /# prefix to get clean element ID: "/#how-it-works" → "how-it-works"
    const hashId = hash.replace(/^\/#/, '')

    if (location.pathname !== '/') {
      // Navigate to home page first
      navigate('/')
      // Wait for navigation, then scroll
      setTimeout(() => {
        const element = document.getElementById(hashId)
        element?.scrollIntoView({ behavior: 'smooth' })
      }, 100)
    } else {
      // Already on home page, just scroll
      const element = document.getElementById(hashId)
      element?.scrollIntoView({ behavior: 'smooth' })
    }
  }

  // Check if a nav link is active
  const isLinkActive = (href: string) => {
    if (href.startsWith('/#')) {
      // Hash links are only active on the home page
      return location.pathname === '/' && location.hash === href.slice(1)
    }
    return location.pathname === href
  }

  return (
    <nav
      aria-label="Main navigation"
      className={cn(
        'sticky top-0 z-sticky bg-background/90 backdrop-blur-md border-b border-border/50',
        className
      )}
    >
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link to="/">
            <Logo size="sm" />
          </Link>

          {/* Desktop navigation */}
          <div className="hidden md:flex md:items-center md:gap-8">
            {navLinks.map((link) => {
              const isActive = isLinkActive(link.href)

              if (link.isHash) {
                // Hash links use custom scroll behavior
                return (
                  <a
                    key={link.label}
                    href={link.href}
                    onClick={handleHashLink(link.href)}
                    className={cn(
                      'text-sm font-medium transition-colors duration-200 cursor-pointer',
                      isActive
                        ? 'text-foreground border-b-2 border-primary pb-1'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {link.label}
                  </a>
                )
              }

              // Regular route links
              return (
                <Link
                  key={link.label}
                  to={link.href}
                  className={cn(
                    'text-sm font-medium transition-colors duration-200',
                    isActive
                      ? 'text-foreground border-b-2 border-primary pb-1'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {link.label}
                </Link>
              )
            })}
          </div>

          {/* Desktop CTAs */}
          <div className="hidden md:flex md:items-center md:gap-4">
            {user ? (
              <Button asChild>
                <Link to="/dashboard">
                  Dashboard
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="ghost">
                  <Link to="/auth/login">Log in</Link>
                </Button>
                <Button
                  asChild
                  className="shadow-sm hover:shadow-md hover:shadow-primary/20 transition-shadow"
                >
                  <Link to="/auth/register">
                    Start Free Trial
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </>
            )}
          </div>

          {/* Mobile menu button */}
          <button
            type="button"
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileMenuOpen}
            className="md:hidden p-2 rounded-button text-foreground hover:bg-muted"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? (
              <X className="h-6 w-6" />
            ) : (
              <Menu className="h-6 w-6" />
            )}
          </button>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="md:hidden pb-4 pt-2 mt-2 rounded-lg border border-border shadow-lg bg-card/95 backdrop-blur-md animate-fade-in-up">
            <div className="space-y-1 px-2">
              {navLinks.map((link) => {
                const isActive = isLinkActive(link.href)

                if (link.isHash) {
                  // Hash links use custom scroll behavior
                  return (
                    <a
                      key={link.label}
                      href={link.href}
                      onClick={(e) => {
                        handleHashLink(link.href)(e)
                        setMobileMenuOpen(false)
                      }}
                      className={cn(
                        'block px-3 py-2 rounded-lg text-base font-medium cursor-pointer',
                        isActive
                          ? 'text-foreground bg-muted'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                      )}
                    >
                      {link.label}
                    </a>
                  )
                }

                // Regular route links
                return (
                  <Link
                    key={link.label}
                    to={link.href}
                    className={cn(
                      'block px-3 py-2 rounded-lg text-base font-medium',
                      isActive
                        ? 'text-foreground bg-muted'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    {link.label}
                  </Link>
                )
              })}
            </div>
            <div className="mt-4 space-y-2 px-4">
              {user ? (
                <Button asChild className="w-full">
                  <Link to="/dashboard">Dashboard</Link>
                </Button>
              ) : (
                <>
                  <Button asChild variant="outline" className="w-full">
                    <Link to="/auth/login">Log in</Link>
                  </Button>
                  <Button asChild className="w-full">
                    <Link to="/auth/register">Start Free Trial</Link>
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </nav>
  )
}
