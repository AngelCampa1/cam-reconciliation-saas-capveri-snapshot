"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildTrialLink } from "@/lib/auditLink";
import { trackMarketingEvent } from "@/lib/posthog";

interface CTABoxProps {
  title: string;
  description: string;
  buttonText?: string;
  utmContent?: string;
  href?: string;
}

export function CTABox({
  title,
  description,
  buttonText = "Start free trial",
  utmContent = "mdx_cta",
  href,
}: CTABoxProps) {
  const linkHref = href ?? buildTrialLink({ content: utmContent });
  return (
    <section className="not-prose bg-primary/5 border border-primary/10 rounded-lg p-6 sm:p-8 text-center mb-8">
      <h2 className="text-xl sm:text-2xl font-bold mb-3">{title}</h2>
      <p className="text-muted-foreground mb-6 max-w-lg mx-auto text-sm sm:text-base">
        {description}
      </p>
      <Button asChild size="lg" className="w-full sm:w-auto">
        <Link
          href={linkHref}
          onClick={() =>
            trackMarketingEvent("cta_clicked", {
              button_text: buttonText,
              location: `mdx_cta_${utmContent}`,
            })
          }
        >
          {buttonText}
          <ArrowRight className="w-4 h-4 ml-2" aria-hidden="true" />
        </Link>
      </Button>
    </section>
  );
}
