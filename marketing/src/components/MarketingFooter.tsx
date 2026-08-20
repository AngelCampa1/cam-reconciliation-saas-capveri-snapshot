import Link from "next/link";
import { ChevronDown, ExternalLink } from "lucide-react";
import { Logo } from "@/components/Logo";
import { cn } from "@/lib/utils";

const footerLinks = {
  product: [
    { label: "Product Tour", href: "/product-tour" },
    { label: "Features", href: "/product/features" },
    { label: "Pricing", href: "/pricing" },
    { label: "Compare CapVeri", href: "/vs" },
  ],
  resources: [
    { label: "Resources", href: "/resources" },
    { label: "Blog", href: "/blog" },
    { label: "Tools", href: "/tools" },
    { label: "CAM Glossary", href: "/glossary" },
  ],
  company: [
    { label: "About", href: "/about" },
    { label: "Contact", href: "/contact" },
    { label: "Help Center", href: "/help" },
    { label: "Sources & Research", href: "/sources" },
  ],
  legal: [
    { label: "Privacy Policy", href: "/privacy" },
    { label: "Terms of Service", href: "/terms" },
    { label: "Cookie Policy", href: "/cookies" },
  ],
};

const footerLinkClass =
  "flex min-h-[44px] items-center py-2.5 -mx-1 px-1 text-sm text-background/[.85] transition-colors duration-200 hover:text-background no-underline rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

interface FooterLink {
  label: string;
  href: string;
}

interface MarketingFooterProps {
  className?: string;
  variant?: "full" | "minimal";
}

function FooterLinkList({
  links,
  external = false,
}: {
  links: FooterLink[];
  external?: boolean;
}) {
  return (
    <ul className="space-y-1">
      {links.map((link) => {
        const isExternal = external || /^https?:\/\//.test(link.href);

        return (
          <li key={link.label}>
            {isExternal ? (
              <a
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(footerLinkClass, "inline-flex gap-1")}
              >
                {link.label}
                <ExternalLink
                  className="h-3 w-3 opacity-60"
                  aria-hidden="true"
                />
                <span className="sr-only">(opens in new tab)</span>
              </a>
            ) : (
              <Link href={link.href} className={footerLinkClass}>
                {link.label}
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function MobileFooterSection({
  title,
  links,
  external = false,
}: {
  title: string;
  links: FooterLink[];
  external?: boolean;
}) {
  return (
    <details className="group border-b border-border/10 md:hidden">
      <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between py-3 text-sm font-semibold uppercase tracking-wider text-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary [&::-webkit-details-marker]:hidden">
        {title}
        <ChevronDown
          aria-hidden="true"
          className="h-5 w-5 transition-transform duration-200 group-open:rotate-180"
        />
      </summary>
      <div className="pb-3">
        <FooterLinkList links={links} external={external} />
      </div>
    </details>
  );
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
              &copy; {currentYear} CapVeri.com. All rights reserved.
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {footerLinks.legal.map((link) => (
                <Link
                  key={link.label}
                  href={link.href}
                  className={footerLinkClass}
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
        {/* Brand section always visible */}
        <div className="mb-6 md:mb-0 md:hidden">
          <Link
            href="/"
            aria-label="CapVeri home"
            className="inline-flex min-h-11 min-w-11 items-center justify-center text-background no-underline hover:no-underline"
          >
            <Logo size="sm" showText={true} />
          </Link>
          <p className="mt-4 text-sm leading-relaxed">
            CAM reconciliation software for commercial landlords and property
            teams.
          </p>
        </div>

        {/* Mobile accordion sections with native details */}
        <div className="md:hidden">
          <MobileFooterSection title="Product" links={footerLinks.product} />
          <MobileFooterSection
            title="Resources"
            links={footerLinks.resources}
          />
          <MobileFooterSection title="Company" links={footerLinks.company} />
          <MobileFooterSection title="Legal" links={footerLinks.legal} />
        </div>

        {/* Desktop footer keeps sitewide links grouped into four clear sections. */}
        <div className="hidden md:grid md:grid-cols-2 md:gap-8 lg:grid-cols-5">
          {/* Brand section */}
          <div>
            <Link
              href="/"
              aria-label="CapVeri home"
              className="inline-flex min-h-11 min-w-11 items-center justify-center no-underline hover:no-underline"
            >
              <Logo size="sm" showText={true} />
            </Link>
            <p className="mt-4 text-sm leading-relaxed">
              CAM reconciliation software for commercial landlords and property
              teams.
            </p>
          </div>

          {/* Product links */}
          <div>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-background">
              Product
            </h3>
            <FooterLinkList links={footerLinks.product} />
          </div>

          {/* Resources links */}
          <div>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-background">
              Resources
            </h3>
            <FooterLinkList links={footerLinks.resources} />
          </div>

          {/* Company links */}
          <div>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-background">
              Company
            </h3>
            <FooterLinkList links={footerLinks.company} />
          </div>

          {/* Legal links */}
          <div>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-background">
              Legal
            </h3>
            <FooterLinkList links={footerLinks.legal} />
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-8 border-t border-border/10 pt-6 md:mt-12 md:pt-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm">
              &copy; {currentYear} CapVeri.com. All rights reserved.
            </p>
            <p className="text-sm">Made with care for CRE professionals.</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
