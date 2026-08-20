/**
 * ContentPageLayout - Shared layout wrapper for resource/content pages.
 *
 * Provides consistent chrome (nav, footer, breadcrumb, SEO) for all
 * pages under /resources/*.
 */

import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { SEO } from '@/components/SEO'
import { LandingNav } from '@/components/landing/LandingNav'
import { Footer } from '@/components/layout/Footer'

interface ContentPageLayoutProps {
  title: string
  description: string
  canonical: string
  pageName: string
  structuredData?: Record<string, unknown> | Record<string, unknown>[]
  children: React.ReactNode
}

export function ContentPageLayout({
  title,
  description,
  canonical,
  pageName,
  structuredData,
  children,
}: ContentPageLayoutProps) {
  return (
    <>
      <SEO
        title={title}
        description={description}
        canonical={canonical}
        ogType="article"
        {...(structuredData !== undefined && { structuredData })}
      />
      <LandingNav />
      <div className="min-h-screen bg-background">
        {/* Breadcrumb */}
        <div className="border-b border-border bg-muted/40">
          <div className="mx-auto max-w-4xl px-4 py-3 sm:px-6 lg:px-8">
            <nav
              className="flex items-center gap-1 text-sm text-muted-foreground"
              aria-label="Breadcrumb"
            >
              <Link
                to="/"
                className="hover:text-foreground transition-colors duration-200"
              >
                Home
              </Link>
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
              <Link
                to="/resources"
                className="hover:text-foreground transition-colors duration-200"
              >
                Resources
              </Link>
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="text-foreground font-medium">{pageName}</span>
            </nav>
          </div>
        </div>

        {/* Back link */}
        <div className="mx-auto max-w-4xl px-4 pt-6 sm:px-6 lg:px-8">
          <Link
            to="/resources"
            className="inline-flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 transition-colors duration-200"
          >
            <ChevronRight
              className="h-3.5 w-3.5 rotate-180"
              aria-hidden="true"
            />
            Back to Resources
          </Link>
        </div>

        {/* App.tsx renders the single <main id="main-content"> landmark; this is a layout div only. */}
        <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
          {children}
        </div>
      </div>
      <Footer />
    </>
  )
}
