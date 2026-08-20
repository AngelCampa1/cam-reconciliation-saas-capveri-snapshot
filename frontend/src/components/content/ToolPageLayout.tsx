/**
 * ToolPageLayout - Shared layout wrapper for free tool pages.
 *
 * Provides consistent chrome (nav, footer, breadcrumb, SEO) for all
 * tool pages under /tools/*.
 */

import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { SEO } from '@/components/SEO'
import { LandingNav } from '@/components/landing/LandingNav'
import { Footer } from '@/components/layout/Footer'

interface ToolPageLayoutProps {
  title: string
  description: string
  canonical: string
  toolName: string
  structuredData?: Record<string, unknown> | Record<string, unknown>[]
  children: React.ReactNode
}

export function ToolPageLayout({
  title,
  description,
  canonical,
  toolName,
  structuredData,
  children,
}: ToolPageLayoutProps) {
  const defaultStructuredData: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    applicationCategory: 'FinanceApplication',
    name: toolName,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  }

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title={title}
        description={description}
        canonical={canonical}
        structuredData={structuredData ?? defaultStructuredData}
      />
      <LandingNav />
      <div className="pt-0">
        <div className="container mx-auto px-4 py-8 sm:px-6 lg:px-8 max-w-5xl">
          {/* Breadcrumb */}
          <nav
            aria-label="Breadcrumb"
            className="mb-6 flex items-center gap-1 text-sm text-muted-foreground"
          >
            <Link
              to="/"
              className="hover:text-foreground transition-colors duration-200"
            >
              Home
            </Link>
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Tools</span>
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="text-foreground font-medium">{toolName}</span>
          </nav>

          {children}

          {/* Fine-print verification disclaimer (applies to every tool) */}
          <p className="mt-12 border-t pt-6 text-xs text-muted-foreground">
            This free tool gives a rough estimate and may be wrong. Check your
            own lease, GL, and tax records before you act on the numbers. It is
            not financial or legal advice.
          </p>
        </div>
      </div>
      <Footer />
    </div>
  )
}
