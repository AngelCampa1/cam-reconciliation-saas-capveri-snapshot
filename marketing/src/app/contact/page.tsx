import type { Metadata } from "next";
import { Suspense } from "react";
import { ContactForm } from "@/components/ContactForm";
import { JsonLd } from "@/components/JsonLd";
import { structuredDataSchemas } from "@/lib/structured-data";
import { buildSiteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Contact Us",
  description:
    "Contact CapVeri for support, sales inquiries, or help choosing a Reconcile plan.",
  alternates: {
    canonical: buildSiteUrl("/contact"),
  },
};

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-background pb-24">
      <JsonLd
        data={structuredDataSchemas.breadcrumbList([
          { name: "Home", url: buildSiteUrl("/") },
          { name: "Contact", url: buildSiteUrl("/contact") },
        ])}
      />
      {/* Header */}
      <div className="border-b bg-muted">
        <div className="container mx-auto px-4 py-8 sm:px-6 lg:px-8">
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground">
            Contact Us
          </h1>
          <p className="mt-2 text-lg text-muted-foreground">
            We respond within 24 hours.
          </p>
        </div>
      </div>
      <Suspense
        fallback={
          <div className="container mx-auto px-4 py-12 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl space-y-6">
              <div className="h-7 w-48 rounded bg-muted animate-pulse" />
              <div className="space-y-4">
                <div className="h-10 rounded bg-muted animate-pulse" />
                <div className="h-10 rounded bg-muted animate-pulse" />
                <div className="h-10 rounded bg-muted animate-pulse" />
                <div className="h-32 rounded bg-muted animate-pulse" />
                <div className="h-11 w-36 rounded bg-muted animate-pulse" />
              </div>
            </div>
          </div>
        }
      >
        <ContactForm />
      </Suspense>
    </div>
  );
}
