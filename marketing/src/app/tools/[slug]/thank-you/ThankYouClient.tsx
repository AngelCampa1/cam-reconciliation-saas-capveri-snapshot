"use client";

import { CheckCircle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildTrialLink } from "@/lib/auditLink";
import { trackMarketingEvent } from "@/lib/posthog";
import { getLeadMagnetName } from "@/lib/lead-magnets/registry";

export function DownloadThankYouContent({ slug }: { slug: string }) {
  const assetName = slug ? getLeadMagnetName(slug) : "Your Resource";

  return (
    <section className="py-24">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center max-w-lg">
        <div className="flex justify-center mb-6">
          <CheckCircle className="h-16 w-16 text-primary" />
        </div>

        <h1 className="text-3xl font-bold mb-4">Check your email</h1>

        <p className="text-muted-foreground mb-8">
          Your download link for the{" "}
          <strong className="text-foreground">{assetName}</strong> is on its
          way. Check your inbox within a few minutes.
        </p>

        <div className="rounded-lg border border-border bg-muted/40 p-6 text-left mb-8">
          <p className="text-sm text-muted-foreground">
            <strong className="text-foreground">
              See how CapVeri automates this calculation entirely.
            </strong>{" "}
            Upload your GL export and get a verified reconciliation in minutes.
          </p>
        </div>

        <Button asChild size="lg">
          <a
            href={`${buildTrialLink({ content: "u_cta" })}`}
            onClick={() =>
              trackMarketingEvent("cta_clicked", {
                button_text: "Start Free Trial",
                location: "thank_you_page",
                tool_slug: slug,
              })
            }
          >
            Start free trial
            <ArrowRight className="ml-2 h-4 w-4" />
          </a>
        </Button>
      </div>
    </section>
  );
}
