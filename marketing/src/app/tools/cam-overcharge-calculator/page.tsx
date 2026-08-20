import type { Metadata } from "next";
import { CamOverchargeCalculator } from "./CamOverchargeCalculatorClient";
import { buildSiteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Tenant Challenge Exposure Calculator",
  description:
    "See where your CAM billing could overcharge tenants. Enter lease size and CAM amount for a breakdown by error type.",
  alternates: {
    canonical: buildSiteUrl("/tools/cam-overcharge-calculator"),
  },
  openGraph: {
    title: "Tenant Challenge Exposure Calculator | CapVeri",
    description:
      "See where your CAM billing may overcharge tenants and trigger a dispute.",
    url: buildSiteUrl("/tools/cam-overcharge-calculator"),
    type: "website",
  },
};

export default function CamOverchargeCalculatorPage() {
  return <CamOverchargeCalculator />;
}
