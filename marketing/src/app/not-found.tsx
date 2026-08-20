import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Page Not Found",
  robots: { index: false, follow: false },
};

const navLinks = [
  { label: "Home", href: "/" },
  { label: "Tools", href: "/tools" },
  { label: "Blog", href: "/blog" },
  { label: "Pricing", href: "/pricing" },
];

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header band - matches contact/page.tsx pattern */}
      <div className="border-b bg-muted">
        <div className="container mx-auto px-4 py-8 sm:px-6 lg:px-8">
          <p className="text-sm font-medium text-muted-foreground uppercase tracking-widest">
            404
          </p>
          <h1 className="mt-1 text-3xl sm:text-4xl font-bold text-foreground">
            Page not found
          </h1>
          <p className="mt-2 text-lg text-muted-foreground">
            This page doesn&apos;t exist or has been moved.
          </p>
        </div>
      </div>

      {/* Body */}
      <div className="container mx-auto px-4 py-12 sm:px-6 lg:px-8">
        <div className="max-w-md space-y-8">
          {/* Primary CTA */}
          <Button asChild size="lg" className="w-full sm:w-auto">
            <Link href="/">Go home</Link>
          </Button>

          {/* Quick-nav links */}
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-3">
              Or jump to a section:
            </p>
            <ul className="space-y-2">
              {navLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-primary hover:underline underline-offset-4"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
