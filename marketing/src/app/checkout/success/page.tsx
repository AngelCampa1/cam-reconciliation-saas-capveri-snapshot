import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { APP_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Checkout Success",
  description: "Your subscription has been activated.",
  robots: { index: false, follow: false },
};

// The checkout success flow requires authentication and lives in the app.
// Redirect to the app's checkout success page.
export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const rawSessionId = params["session_id"];
  const sessionId = Array.isArray(rawSessionId)
    ? (rawSessionId[0] ?? "")
    : (rawSessionId ?? "");
  const query = new URLSearchParams();
  if (sessionId) {
    query.set("session_id", sessionId);
  }
  const queryString = query.toString();

  redirect(
    `${APP_URL}/checkout/success${queryString ? `?${queryString}` : ""}`,
  );
}
