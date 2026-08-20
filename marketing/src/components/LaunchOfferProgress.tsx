"use client";

import Link from "next/link";
import { LAUNCH_OFFER, LAUNCH_OFFER_CODE } from "@/config/launch-offer";
import { useActiveLaunchPhase } from "@/lib/launch-phase";

export function LaunchOfferProgress() {
  const phase = useActiveLaunchPhase();

  if (phase.all_exhausted) {
    return (
      <div className="rounded-lg border border-border bg-muted/50 px-4 py-3 text-center text-base text-muted-foreground sm:text-sm">
        Limited offer closed. Standard pricing applies.
      </div>
    );
  }

  const code = phase.code ?? LAUNCH_OFFER_CODE;
  const discountPercent =
    phase.discount_percent ?? LAUNCH_OFFER.discountPercent;
  const endsDisplay = phase.ends_at_display ?? LAUNCH_OFFER.endsAtDisplay;

  return (
    <div className="rounded-lg border border-border bg-background px-4 py-3 text-base text-muted-foreground sm:text-sm">
      Limited time offer: {discountPercent}% off the first year with{" "}
      <span className="font-semibold text-foreground">{code}</span>.{" "}
      {endsDisplay ? `Offer ends ${endsDisplay}. ` : ""}
      <Link
        href="/terms#limited-offer"
        className="inline-flex min-h-11 items-center font-medium underline sm:min-h-0"
      >
        Offer details
      </Link>
      .
    </div>
  );
}
