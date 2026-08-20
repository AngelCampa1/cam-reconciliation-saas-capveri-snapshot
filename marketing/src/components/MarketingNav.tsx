"use client";

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type FocusEvent,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, ArrowRight, ChevronDown } from "lucide-react";
import { Logo } from "@/components/Logo";
import { buildTrialLink } from "@/lib/auditLink";
import { LAUNCH_OFFER } from "@/config/launch-offer";
import { publicKnowledge } from "@/generated/public-knowledge";
import { useActiveLaunchPhase } from "@/lib/launch-phase";
import { resourcesMegamenuPillars } from "@/lib/seo/resources-megamenu";
import { forRoleMenuItems } from "@/lib/seo/for-role-menu";
import { cn } from "@/lib/utils";
import { trackMarketingEvent } from "@/lib/posthog";

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? publicKnowledge.company.appUrl;

const productMenuSections = [
  {
    title: "Use CapVeri",
    links: [
      {
        label: "Product tour",
        href: "/product-tour",
        description: "See how the CAM review flow works.",
      },
      {
        label: "Features",
        href: "/product/features",
        description: "Review the tools by workflow.",
      },
      {
        label: "Supported ERP exports",
        href: "/integrations",
        description: "Use files from Yardi, MRI, and more.",
      },
    ],
  },
  {
    title: "Find your fit",
    links: [
      {
        label: "Solutions",
        href: "/solutions",
        description: "Choose a path by CAM problem.",
      },
      {
        label: "For your role",
        href: "/for",
        description: "See the workflow for your team.",
      },
      {
        label: "Compare CapVeri",
        href: "/vs",
        description: "Compare CapVeri with other options.",
      },
    ],
  },
];

const navLinks = [
  { label: "Product", href: "/product-tour" },
  { label: "Pricing", href: "/pricing" },
  { label: "Resources", href: "/resources" },
  { label: "About", href: "/about" },
];

type DesktopMenuId = "product" | "resources";

export function MarketingNav() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [desktopOpenMenu, setDesktopOpenMenu] = useState<DesktopMenuId | null>(
    null,
  );
  const pathname = usePathname();
  const activePhase = useActiveLaunchPhase();
  const activeOfferCode = activePhase.all_exhausted
    ? null
    : (activePhase.code ?? LAUNCH_OFFER.code);
  const hamburgerRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const productTriggerRef = useRef<HTMLAnchorElement>(null);
  const resourcesTriggerRef = useRef<HTMLAnchorElement>(null);

  const closeMobileMenu = useCallback(() => {
    setMobileMenuOpen(false);
  }, []);

  const handleDesktopMenuBlur = useCallback(
    (event: FocusEvent<HTMLDivElement>) => {
      const nextTarget = event.relatedTarget;
      if (
        !(nextTarget instanceof Node) ||
        !event.currentTarget.contains(nextTarget)
      ) {
        setDesktopOpenMenu(null);
      }
    },
    [],
  );

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileMenuOpen]);

  // ESC to close + focus trap; return focus to hamburger on close
  useEffect(() => {
    if (!mobileMenuOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeMobileMenu();
        return;
      }
      if (e.key === "Tab" && drawerRef.current) {
        const focusables = drawerRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"]), input, select, textarea',
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement as HTMLElement | null;
        if (e.shiftKey && active === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    // Move focus into drawer for keyboard users
    const firstFocusable = drawerRef.current?.querySelector<HTMLElement>(
      "a[href], button:not([disabled])",
    );
    firstFocusable?.focus();

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeMobileMenu, mobileMenuOpen]);

  // Return focus to hamburger when drawer closes
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (wasOpenRef.current && !mobileMenuOpen) {
      hamburgerRef.current?.focus();
    }
    wasOpenRef.current = mobileMenuOpen;
  }, [mobileMenuOpen]);

  const isLinkActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);
  const isProductActive =
    isLinkActive("/product") ||
    isLinkActive("/product-tour") ||
    isLinkActive("/solutions") ||
    isLinkActive("/for") ||
    isLinkActive("/integrations") ||
    isLinkActive("/vs");

  const linkBaseClass =
    "text-sm font-medium transition-colors duration-200 no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-full pb-1";

  return (
    <nav
      aria-label="Main navigation"
      className="sticky top-0 z-sticky bg-background/90 backdrop-blur-md border-b border-border/50"
    >
      {!activePhase.all_exhausted && (
        <div className="border-b border-primary/20 bg-primary text-primary-foreground">
          <div className="container mx-auto flex min-h-11 items-center justify-center px-4 text-center text-sm font-semibold sm:min-h-9 sm:px-6 lg:px-8">
            <span>
              Limited-time launch offer. Get 80% off the first year. Use code{" "}
              <a
                href="/pricing"
                aria-label="Apply launch offer code 80OFF on the pricing page"
                className="inline-flex min-h-11 items-center rounded-full bg-primary-foreground/15 px-2.5 py-0.5 font-mono text-xs font-bold tracking-wider text-primary-foreground transition-opacity duration-200 hover:opacity-80 sm:min-h-9"
              >
                80OFF
              </a>{" "}
              at checkout.
              {activePhase.ends_at_display
                ? ` Offer ends ${activePhase.ends_at_display}.`
                : ""}
            </span>
          </div>
        </div>
      )}
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-2">
          {/* Logo */}
          <Link
            href="/"
            className="no-underline hover:no-underline inline-flex min-h-[44px] items-center"
          >
            <Logo size="sm" />
          </Link>

          {/* Desktop navigation */}
          <div className="hidden lg:flex lg:items-center lg:gap-6">
            {navLinks.map((link) => {
              const isActive =
                link.label === "Product"
                  ? isProductActive
                  : isLinkActive(link.href);
              if (link.label === "Product") {
                const isOpen = desktopOpenMenu === "product";
                return (
                  <div
                    key={link.label}
                    className="relative"
                    onMouseEnter={() => setDesktopOpenMenu("product")}
                    onMouseLeave={() => setDesktopOpenMenu(null)}
                    onFocus={() => setDesktopOpenMenu("product")}
                    onBlur={handleDesktopMenuBlur}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        event.preventDefault();
                        setDesktopOpenMenu(null);
                        productTriggerRef.current?.focus();
                      }
                    }}
                  >
                    <Link
                      ref={productTriggerRef}
                      href={link.href}
                      aria-expanded={isOpen}
                      aria-controls="desktop-product-menu"
                      aria-current={isActive ? "page" : undefined}
                      className={cn(
                        linkBaseClass,
                        "inline-flex items-center gap-1",
                        isActive
                          ? "border-b-2 border-primary text-foreground"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {link.label}
                      <ChevronDown aria-hidden="true" className="h-3 w-3" />
                    </Link>
                    <div
                      id="desktop-product-menu"
                      className={cn(
                        "absolute left-1/2 top-full z-dropdown w-[min(92vw,640px)] -translate-x-1/2 pt-3 transition-all duration-150",
                        isOpen
                          ? "visible opacity-100"
                          : "invisible opacity-0 pointer-events-none",
                      )}
                    >
                      <div className="rounded-lg border border-border bg-background p-5 shadow-xl">
                        <div className="grid grid-cols-2 gap-5">
                          {productMenuSections.map((section) => (
                            <div key={section.title}>
                              <p className="px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                {section.title}
                              </p>
                              <div className="mt-2 grid gap-1">
                                {section.links.map((item) => (
                                  <Link
                                    key={item.href}
                                    href={item.href}
                                    className="rounded-lg p-3 no-underline transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                                  >
                                    <span className="block text-sm font-semibold text-foreground">
                                      {item.label}
                                    </span>
                                    <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                                      {item.description}
                                    </span>
                                  </Link>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="mt-4 border-t border-border pt-3">
                          <p className="px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Teams
                          </p>
                          <div className="mt-2 grid grid-cols-2 gap-1">
                            {forRoleMenuItems.slice(0, 4).map((item) => (
                              <Link
                                key={item.href}
                                href={item.href}
                                className="rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground no-underline transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                              >
                                {item.label}
                              </Link>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              }
              if (link.label === "Resources") {
                const isOpen = desktopOpenMenu === "resources";
                return (
                  <div
                    key={link.label}
                    className="relative"
                    onMouseEnter={() => setDesktopOpenMenu("resources")}
                    onMouseLeave={() => setDesktopOpenMenu(null)}
                    onFocus={() => setDesktopOpenMenu("resources")}
                    onBlur={handleDesktopMenuBlur}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        event.preventDefault();
                        setDesktopOpenMenu(null);
                        resourcesTriggerRef.current?.focus();
                      }
                    }}
                  >
                    <Link
                      ref={resourcesTriggerRef}
                      href={link.href}
                      aria-expanded={isOpen}
                      aria-controls="desktop-resources-menu"
                      aria-current={isActive ? "page" : undefined}
                      className={cn(
                        linkBaseClass,
                        "inline-flex items-center gap-1",
                        isActive
                          ? "border-b-2 border-primary text-foreground"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {link.label}
                      <ChevronDown aria-hidden="true" className="h-3 w-3" />
                    </Link>
                    <div
                      id="desktop-resources-menu"
                      className={cn(
                        "absolute left-1/2 top-full z-dropdown w-[min(92vw,700px)] -translate-x-1/2 pt-3 transition-all duration-150",
                        isOpen
                          ? "visible opacity-100"
                          : "invisible opacity-0 pointer-events-none",
                      )}
                    >
                      <div className="rounded-lg border border-border bg-background p-5 shadow-xl">
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                          {resourcesMegamenuPillars.map((pillar) => (
                            <Link
                              key={pillar.href}
                              href={pillar.href}
                              className="rounded-lg p-3 no-underline transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                            >
                              <span className="block text-sm font-semibold text-foreground">
                                {pillar.label}
                              </span>
                              <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                                {pillar.description}
                              </span>
                            </Link>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              }
              return (
                <Link
                  key={link.label}
                  href={link.href}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    linkBaseClass,
                    isActive
                      ? "border-b-2 border-primary text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>

          {/* Desktop CTAs */}
          <div className="hidden lg:flex lg:items-center lg:gap-4">
            <a
              href={`${APP_URL}/auth/login`}
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors duration-200 no-underline"
            >
              Sign in
            </a>
            <a
              href={buildTrialLink({
                content: "nav_desktop_cta",
                offer: activeOfferCode,
              })}
              className="inline-flex items-center gap-2 rounded-button bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/90 transition-colors duration-200 no-underline"
              onClick={() =>
                trackMarketingEvent("cta_clicked", {
                  button_text: "Start free trial",
                  location: "nav_desktop",
                })
              }
            >
              Start free trial
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </a>
          </div>

          {/* Mobile menu button */}
          <button
            ref={hamburgerRef}
            type="button"
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-nav-drawer"
            className="relative z-modal inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-button text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary lg:hidden"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? (
              <X className="h-6 w-6" aria-hidden="true" />
            ) : (
              <Menu className="h-6 w-6" aria-hidden="true" />
            )}
          </button>
        </div>

        {/* Backdrop for mobile click dismissal */}
        {mobileMenuOpen && (
          <div
            aria-hidden="true"
            className="fixed inset-0 top-16 z-overlay bg-foreground/40 backdrop-blur-sm lg:hidden"
            onClick={closeMobileMenu}
          />
        )}

        {/* Mobile menu */}
        <div
          id="mobile-nav-drawer"
          ref={drawerRef}
          role="dialog"
          aria-modal="true"
          aria-label="Mobile navigation"
          hidden={!mobileMenuOpen}
          className={cn(
            "relative z-modal overflow-hidden transition-all duration-200 ease-out lg:hidden",
            mobileMenuOpen
              ? "max-h-[80vh] opacity-100 mt-2"
              : "max-h-0 opacity-0 mt-0 pointer-events-none",
          )}
        >
          <div className="pb-4 pt-2 rounded-lg border border-border shadow-lg bg-card/95 backdrop-blur-md overflow-y-auto max-h-[80vh]">
            {/* Sign in pinned near top for reachability */}
            <div className="flex items-center justify-between gap-3 px-4 pb-2">
              <a
                href={`${APP_URL}/auth/login`}
                className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-button border border-border px-4 py-3 text-sm font-medium text-foreground hover:bg-muted transition-colors duration-200 no-underline"
                onClick={closeMobileMenu}
              >
                Sign in
              </a>
            </div>
            <div className="space-y-1 px-2">
              {navLinks.map((link) => {
                const isSection = link.label === "Product";
                const isActive = isSection
                  ? isProductActive
                  : isLinkActive(link.href);
                return (
                  <div key={link.label}>
                    <Link
                      href={link.href}
                      aria-current={
                        isActive ? (isSection ? "true" : "page") : undefined
                      }
                      className={cn(
                        "flex min-h-[44px] items-center px-3 py-3 rounded-full text-base font-medium no-underline",
                        isActive
                          ? "text-foreground bg-muted"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                      onClick={closeMobileMenu}
                    >
                      {link.label}
                    </Link>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 space-y-2 px-4">
              <a
                href={buildTrialLink({
                  content: "nav_mobile_cta",
                  offer: activeOfferCode,
                })}
                className="flex min-h-[44px] w-full items-center justify-center rounded-button bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors duration-200 no-underline"
                onClick={() => {
                  trackMarketingEvent("cta_clicked", {
                    button_text: "Start free trial",
                    location: "nav_mobile",
                  });
                  closeMobileMenu();
                }}
              >
                Start free trial
              </a>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
