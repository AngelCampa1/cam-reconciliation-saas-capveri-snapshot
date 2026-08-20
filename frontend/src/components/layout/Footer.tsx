/**
 * Footer Component
 *
 * Site-wide footer with navigation links and copyright.
 */
import { Link } from 'react-router-dom'
import { Logo } from '@/components/ui/logo'
import { cn } from '@/lib/utils'

const footerLinks = {
  product: [
    { label: 'How It Works', href: '/#how-it-works' },
    { label: 'Pricing', href: '/pricing' },
  ],
  resources: [
    { label: 'Resources', href: '/resources' },
    {
      label: 'What Tenant Auditors Look For',
      href: '/resources/tenant-auditor-guide',
    },
    {
      label: 'CAM Pre-Send Checklist',
      href: '/resources/cam-presend-checklist',
    },
    { label: 'BOMA 2024 Changes', href: '/resources/boma-2024-changes' },
    { label: 'GL Coding Guide', href: '/resources/gl-coding-guide' },
  ],
  tools: [
    { label: 'Tools', href: '/tools' },
    {
      label: 'CAM Billing Risk Estimator',
      href: '/tools/cam-leakage-estimator',
    },
    { label: 'Pre-Send Audit Exposure Quiz', href: '/tools/audit-risk-quiz' },
    {
      label: 'CAM Gross-Up Calculator',
      href: '/tools/cam-gross-up-calculator',
    },
    { label: 'Lease Abstract Matrix', href: '/tools/lease-abstract-matrix' },
  ],
  compare: [
    { label: 'CapVeri vs Yardi', href: '/vs/yardi' },
    { label: 'CapVeri vs MRI', href: '/vs/mri' },
    { label: 'CapVeri vs AppFolio', href: '/vs/appfolio' },
  ],
  company: [
    { label: 'About', href: '/about' },
    { label: 'Contact', href: '/contact' },
  ],
  legal: [
    { label: 'Privacy Policy', href: '/privacy' },
    { label: 'Terms of Service', href: '/terms' },
    { label: 'Cookie Policy', href: '/cookies' },
  ],
  related: [
    { label: 'Lextract: Lease Abstraction', href: 'https://www.lextract.io' },
    { label: 'CAMAudit: CAM Audit', href: 'https://www.camaudit.io' },
  ],
}

export interface FooterProps {
  /** Additional CSS classes */
  className?: string
  /** Footer variant - 'full' shows all sections, 'minimal' shows only legal/copyright */
  variant?: 'full' | 'minimal'
}

export function Footer({ className, variant = 'full' }: FooterProps) {
  const currentYear = new Date().getFullYear()

  // Minimal variant - only show copyright and legal links
  if (variant === 'minimal') {
    return (
      <footer className={cn('bg-foreground text-background/[.90]', className)}>
        <div className="container mx-auto px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <p className="text-sm">
              &copy; {currentYear} CapVeri. All rights reserved.
            </p>
            <div className="flex gap-4">
              {footerLinks.legal.map((link) => (
                <Link
                  key={link.label}
                  to={link.href}
                  className="text-sm text-background/[.85] transition-colors duration-200 hover:text-background"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </footer>
    )
  }

  // Full variant - show all sections
  return (
    <footer className={cn('bg-foreground text-background/[.90]', className)}>
      <div className="container mx-auto px-4 py-12 sm:px-6 lg:px-8">
        {/* Main footer content */}
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-7">
          {/* Brand section */}
          <div>
            <Link to="/">
              <Logo size="sm" showText={false} />
            </Link>
            <p className="mt-4 text-sm leading-relaxed">
              CRE financial operations and compliance for commercial real estate
              professionals.
            </p>
          </div>

          {/* Product links */}
          <div>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-background">
              Product
            </h3>
            <ul className="space-y-3">
              {footerLinks.product.map((link) => (
                <li key={link.label}>
                  <Link
                    to={link.href}
                    className="text-sm text-background/[.85] transition-colors duration-200 hover:text-background"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Resources links */}
          <div>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-background">
              Resources
            </h3>
            <ul className="space-y-3">
              {footerLinks.resources.map((link) => (
                <li key={link.label}>
                  <Link
                    to={link.href}
                    className="text-sm text-background/[.85] transition-colors duration-200 hover:text-background"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Tools links */}
          <div>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-background">
              Tools
            </h3>
            <ul className="space-y-3">
              {footerLinks.tools.map((link) => (
                <li key={link.label}>
                  <Link
                    to={link.href}
                    className="text-sm text-background/[.85] transition-colors duration-200 hover:text-background"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Compare links */}
          <div>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-background">
              Compare
            </h3>
            <ul className="space-y-3">
              {footerLinks.compare.map((link) => (
                <li key={link.label}>
                  <Link
                    to={link.href}
                    className="text-sm text-background/[.85] transition-colors duration-200 hover:text-background"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Company links */}
          <div>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-background">
              Company
            </h3>
            <ul className="space-y-3">
              {footerLinks.company.map((link) => (
                <li key={link.label}>
                  <Link
                    to={link.href}
                    className="text-sm text-background/[.85] transition-colors duration-200 hover:text-background"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal links */}
          <div>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-background">
              Legal
            </h3>
            <ul className="space-y-3">
              {footerLinks.legal.map((link) => (
                <li key={link.label}>
                  <Link
                    to={link.href}
                    className="text-sm text-background/[.85] transition-colors duration-200 hover:text-background"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Related Tools */}
          <div>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-background">
              Related Tools
            </h3>
            <ul className="space-y-3">
              {footerLinks.related.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-background/[.85] transition-colors duration-200 hover:text-background"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-12 border-t border-border/10 pt-8">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <p className="text-sm">
              &copy; {currentYear} CapVeri. All rights reserved.
            </p>
            <p className="text-sm">Made with care for CRE professionals.</p>
          </div>
        </div>
      </div>
    </footer>
  )
}
