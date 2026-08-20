import type { Metadata } from "next";
import { UnsubscribeClient } from "./UnsubscribeClient";

export const metadata: Metadata = {
  title: "Unsubscribe - CapVeri",
  description: "Unsubscribe from CapVeri marketing emails.",
  robots: { index: false, follow: false },
};

export default function UnsubscribePage() {
  return <UnsubscribeClient />;
}
