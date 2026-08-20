# Story T4.3: Tenant Nav and Footer Layout

## Story Info
- **Epic**: T4 — marketing-tenant/ Scaffold
- **Estimated Hours**: 4
- **Dependencies**: T4.1
- **Status**: `pending`

## User Story
As a commercial tenant visiting the audit site, I want clear navigation and a professional footer so that I can find pricing, learn how the service works, and trust the organization behind it.

## Acceptance Criteria
- `MarketingNav.tsx` renders tenant-specific nav links: How It Works, Pricing, Sample Report, Blog
- Nav includes primary CTA button: "Audit My CAM Charges" linking to `/audit/start`
- Nav is sticky, has backdrop blur, and collapses to a hamburger menu on mobile
- `MarketingFooter.tsx` renders tenant-specific footer sections: Product, Resources, Company, Legal
- Footer does not include landlord-specific links (Tools, Compare, etc.)
- Footer includes copyright, legal links (Privacy, Terms, Cookies), and company tagline
- Footer supports `variant="full"` (default) and `variant="minimal"` for wizard/checkout pages
- Active nav link is visually distinguished (underline + foreground color)
- Mobile menu opens/closes correctly and closes on link click
- Both components use the shared `Logo` component
- Both components use design tokens from `generated/tokens.css` (no hardcoded colors)

## Technical Specifications

### components/MarketingNav.tsx

```typescript
"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, ArrowRight } from "lucide-react";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { cn } from "@/lib/utils";

const navLinks = [
  { label: "How It Works", href: "/#how-it-works" },
  { label: "Pricing", href: "/#pricing" },
  { label: "Sample Report", href: "/sample-report" },
  { label: "Blog", href: "/blog" },
];

export function MarketingNav() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();

  const isLinkActive = (href: string) => {
    if (href === "/") return pathname === "/";
    if (href.startsWith("/#")) return pathname === "/";
    return pathname.startsWith(href);
  };

  return (
    <nav className="sticky top-0 z-[10] bg-background/90 backdrop-blur-md border-b border-border/50">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link href="/" className="no-underline hover:no-underline">
            <Logo size="sm" />
          </Link>

          {/* Desktop navigation */}
          <div className="hidden md:flex md:items-center md:gap-8">
            {navLinks.map((link) => {
              const isActive = isLinkActive(link.href);
              return (
                <Link
                  key={link.label}
                  href={link.href}
                  className={cn(
                    "text-sm font-medium transition-colors no-underline",
                    isActive
                      ? "text-foreground border-b-2 border-primary pb-1"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>

          {/* Desktop CTAs */}
          <div className="hidden md:flex md:items-center md:gap-4">
            <ThemeToggle />
            <Link
              href="/audit/start"
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/90 transition-all no-underline"
            >
              Audit My CAM Charges
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          {/* Mobile menu button */}
          <button
            type="button"
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileMenuOpen}
            className="md:hidden p-2 rounded-lg text-foreground hover:bg-muted"
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
          <div className="md:hidden pb-4 pt-2 mt-2 rounded-lg border border-border shadow-lg bg-card/95 backdrop-blur-md">
            <div className="space-y-1 px-2">
              {navLinks.map((link) => (
                <Link
                  key={link.label}
                  href={link.href}
                  className={cn(
                    "block px-3 py-2 rounded-lg text-base font-medium no-underline",
                    isLinkActive(link.href)
                      ? "text-foreground bg-muted"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {link.label}
                </Link>
              ))}
            </div>
            <div className="mt-4 space-y-2 px-4">
              <div className="flex justify-end">
                <ThemeToggle />
              </div>
              <Link
                href="/audit/start"
                className="block w-full text-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors no-underline"
              >
                Audit My CAM Charges
              </Link>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
```

### components/MarketingFooter.tsx

```typescript
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { cn } from "@/lib/utils";

const footerLinks = {
  product: [
    { label: "How It Works", href: "/#how-it-works" },
    { label: "Pricing", href: "/#pricing" },
    { label: "Sample Report", href: "/sample-report" },
  ],
  resources: [
    { label: "Blog", href: "/blog" },
    { label: "Help Center", href: "/help" },
    { label: "CAM Audit Guide", href: "/blog/cam-audit-guide" },
  ],
  company: [
    { label: "About", href: "/about" },
    { label: "Contact", href: "/contact" },
  ],
  legal: [
    { label: "Privacy Policy", href: "/privacy" },
    { label: "Terms of Service", href: "/terms" },
    { label: "Cookie Policy", href: "/cookies" },
  ],
};

interface MarketingFooterProps {
  className?: string;
  variant?: "full" | "minimal";
}

export function MarketingFooter({
  className,
  variant = "full",
}: MarketingFooterProps) {
  const currentYear = new Date().getFullYear();

  if (variant === "minimal") {
    return (
      <footer className={cn("bg-foreground text-background/[.90]", className)}>
        <div className="container mx-auto px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <p className="text-sm">
              &copy; {currentYear} CapVeri. All rights reserved.
            </p>
            <div className="flex gap-4">
              {footerLinks.legal.map((link) => (
                <Link
                  key={link.label}
                  href={link.href}
                  className="text-sm text-background/[.85] transition-colors hover:text-background no-underline"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </footer>
    );
  }

  return (
    <footer className={cn("bg-foreground text-background/[.90]", className)}>
      <div className="container mx-auto px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-5">
          {/* Brand section */}
          <div>
            <Link href="/" className="no-underline hover:no-underline">
              <Logo size="sm" showText={false} />
            </Link>
            <p className="mt-4 text-sm leading-relaxed">
              Independent CAM audit service for commercial tenants. Every charge
              verified against your lease.
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
                    href={link.href}
                    className="text-sm text-background/[.85] transition-colors hover:text-background no-underline"
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
                    href={link.href}
                    className="text-sm text-background/[.85] transition-colors hover:text-background no-underline"
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
                    href={link.href}
                    className="text-sm text-background/[.85] transition-colors hover:text-background no-underline"
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
                    href={link.href}
                    className="text-sm text-background/[.85] transition-colors hover:text-background no-underline"
                  >
                    {link.label}
                  </Link>
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
            <p className="text-sm">
              Independent CAM audits for commercial tenants.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
```

### Key Differences from marketing/ Nav

| Aspect | marketing/ (Landlord) | marketing-tenant/ (Tenant) |
|--------|----------------------|---------------------------|
| Nav links | Tools, Resources, Blog, Pricing | How It Works, Pricing, Sample Report, Blog |
| Primary CTA | "Start Free Audit" (links to app) | "Audit My CAM Charges" (links to /audit/start) |
| Secondary CTA | "Log in" (links to app auth) | None (no login for tenant product) |
| External links | `buildAuditLink()` to app.capveri.com | Internal `/audit/start` links |
| Footer columns | 7 (Product, Resources, Tools, Compare, Company, Legal, Brand) | 5 (Brand, Product, Resources, Company, Legal) |
| Footer tagline | "Made with care for CRE professionals" | "Independent CAM audits for commercial tenants" |

## Test Cases
- Nav renders 4 links: How It Works, Pricing, Sample Report, Blog
- Nav CTA button text is "Audit My CAM Charges"
- Nav CTA links to `/audit/start`
- Nav does not contain "Log in" link or external app URL
- Nav does not contain "Tools" or "Resources" hub link
- Active link detection works for hash links (`/#how-it-works` active when on `/`)
- Active link detection works for path links (`/blog` active when on `/blog/some-post`)
- Mobile menu toggle works (open/close)
- Mobile menu closes when a link is clicked
- Mobile hamburger button has correct `aria-label` and `aria-expanded`
- Footer full variant renders 5 columns (Brand, Product, Resources, Company, Legal)
- Footer minimal variant renders copyright and legal links only
- Footer does not contain "Tools", "Compare", or landlord-specific links
- Footer brand description says "Independent CAM audit service for commercial tenants"
- Footer bottom bar tagline says "Independent CAM audits for commercial tenants"
- Footer copyright year is dynamic (current year)
- Both components render without hydration errors
- Both components use `cn()` utility for className merging
- No hardcoded color values (all use Tailwind design token classes)

## Definition of Done
- [ ] `components/MarketingNav.tsx` created with tenant nav links and CTA
- [ ] `components/MarketingFooter.tsx` created with tenant footer sections
- [ ] Nav links: How It Works, Pricing, Sample Report, Blog
- [ ] Nav CTA: "Audit My CAM Charges" linking to `/audit/start`
- [ ] No login link or external app URL in nav
- [ ] Footer full variant: 5 columns (Brand, Product, Resources, Company, Legal)
- [ ] Footer minimal variant: copyright + legal links
- [ ] No landlord-specific links in footer (no Tools, Compare, etc.)
- [ ] Sticky nav with backdrop blur
- [ ] Mobile hamburger menu with open/close and link-click-to-close
- [ ] Correct `aria-label` and `aria-expanded` on mobile toggle
- [ ] Active link visual indicator (border-b-2 + foreground color)
- [ ] `ThemeToggle` included in both desktop and mobile nav
- [ ] `npm run build` exits 0
- [ ] `npm run typecheck` exits 0
- [ ] Changes committed
