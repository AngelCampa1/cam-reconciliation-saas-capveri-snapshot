/**
 * Cookie Policy Page
 *
 * Cookie policy explaining how CapVeri uses cookies
 */
import { LandingNav } from '@/components/landing/LandingNav'
import { Footer } from '@/components/layout/Footer'
import { SEO } from '@/components/SEO'
import { publicKnowledge } from '@/generated/public-knowledge'

export function CookiePolicyPage() {
  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="Cookie Policy - CapVeri"
        description="CapVeri cookie policy: how we use essential, analytics, and marketing cookies. Learn how to manage your cookie preferences."
        canonical="/cookies"
      />
      <LandingNav variant="light" />

      {/* Header */}
      <div className="border-b bg-muted pt-16">
        <div className="container mx-auto px-4 py-8 sm:px-6 lg:px-8">
          <h1 className="text-xl md:text-2xl lg:text-3xl font-bold text-foreground">
            Cookie Policy
          </h1>
          <p className="mt-2 text-muted-foreground">
            Last updated: January 2026
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 py-12 sm:px-6 lg:px-8">
        <div className="max-w-3xl space-y-6">
          <section>
            <h2 className="text-base md:text-lg lg:text-xl font-semibold text-foreground mb-3">
              What Are Cookies?
            </h2>
            <p className="text-muted-foreground">
              Cookies are small text files stored on your device when you visit
              a website. They help websites remember your preferences and
              improve your experience.
            </p>
          </section>

          <section>
            <h2 className="text-base md:text-lg lg:text-xl font-semibold text-foreground mb-3">
              How We Use Cookies
            </h2>
            <p className="text-muted-foreground mb-4">
              CapVeri uses cookies for the following purposes:
            </p>

            <h3 className="text-lg font-medium text-foreground mb-2">
              Essential Cookies
            </h3>
            <p className="text-muted-foreground mb-2">
              These cookies are necessary for the Service to function properly.
              They include:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4 mb-4">
              <li>Authentication tokens to keep you logged in</li>
              <li>Session identifiers for security</li>
              <li>User preferences (theme, language)</li>
            </ul>

            <h3 className="text-lg font-medium text-foreground mb-2">
              Analytics Cookies
            </h3>
            <p className="text-muted-foreground mb-2">
              We use analytics cookies to understand how users interact with our
              Service. This helps us improve functionality and user experience.
              We use:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4 mb-4">
              <li>Page view tracking</li>
              <li>Feature usage statistics</li>
              <li>Error monitoring</li>
            </ul>

            <h3 className="text-lg font-medium text-foreground mb-2">
              Marketing Cookies
            </h3>
            <p className="text-muted-foreground">
              We may use marketing cookies to deliver relevant advertisements
              and track campaign effectiveness. These are optional and can be
              disabled.
            </p>
          </section>

          <section>
            <h2 className="text-base md:text-lg lg:text-xl font-semibold text-foreground mb-3">
              Managing Cookies
            </h2>
            <p className="text-muted-foreground mb-3">
              You can control cookies through your browser settings. Note that
              disabling essential cookies may affect Service functionality.
            </p>
            <p className="text-muted-foreground mb-2">
              Most browsers allow you to:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
              <li>View stored cookies</li>
              <li>Delete specific or all cookies</li>
              <li>Block cookies from specific sites</li>
              <li>Block all third-party cookies</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base md:text-lg lg:text-xl font-semibold text-foreground mb-3">
              Third-Party Cookies
            </h2>
            <p className="text-muted-foreground mb-2">
              Some third-party services we use may set their own cookies:
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-4">
              <li>Supabase (authentication)</li>
              <li>Stripe (payment processing)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base md:text-lg lg:text-xl font-semibold text-foreground mb-3">
              Updates to This Policy
            </h2>
            <p className="text-muted-foreground">
              We may update this Cookie Policy periodically. Check this page for
              the latest information on our cookie practices.
            </p>
          </section>

          <section>
            <h2 className="text-base md:text-lg lg:text-xl font-semibold text-foreground mb-3">
              Contact Us
            </h2>
            <p className="text-muted-foreground">
              For questions about our cookie practices, contact us at{' '}
              <a
                href={publicKnowledge.contacts.byId.privacy.mailto}
                className="text-primary hover:underline font-medium"
              >
                {publicKnowledge.contacts.byId.privacy.email}
              </a>
              .
            </p>
          </section>
        </div>
      </div>

      <Footer />
    </div>
  )
}
