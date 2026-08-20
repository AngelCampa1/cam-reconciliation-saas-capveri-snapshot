import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { APP_URL } from "@/lib/site";
import { publicKnowledge } from "@/generated/public-knowledge";

export const metadata: Metadata = {
  title: "Checkout",
  description: `Start your CapVeri ${publicKnowledge.pricing.display.trialCopy} with no credit card required.`,
  robots: { index: false, follow: false },
};

// The checkout flow requires authentication and lives in the app.
// Redirect to the app's checkout.
export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const nextParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    const firstValue = Array.isArray(value) ? value[0] : value;
    if (firstValue) {
      nextParams.set(key, firstValue);
    }
  }

  const legacyPlan = nextParams.get("plan");
  if (!nextParams.has("tier") && legacyPlan) {
    nextParams.set("tier", "reconcile");
  }
  nextParams.delete("plan");

  if (!nextParams.has("tier")) {
    nextParams.set("tier", "reconcile");
  }

  redirect(`${APP_URL}/checkout?${nextParams.toString()}`);
}
