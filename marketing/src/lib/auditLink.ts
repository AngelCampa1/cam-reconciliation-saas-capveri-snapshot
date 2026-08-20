import { LAUNCH_OFFER } from "@/config/launch-offer";
import { APP_URL } from "@/lib/site";

type BuildTrialLinkArgs = {
  content: string;
  campaign?: string;
  plan?: string;
  buildings?: number;
  units?: number;
  source?: string;
  offer?: string | null;
};

export function buildTrialLink({
  content,
  campaign = "free_trial",
  plan,
  buildings,
  units,
  source,
  offer = LAUNCH_OFFER.code,
}: BuildTrialLinkArgs): string {
  const url = new URL("/auth/register", APP_URL);
  const params = url.searchParams;

  params.set("utm_source", "marketing_site");
  params.set("utm_medium", "website");
  params.set("utm_campaign", campaign);
  params.set("utm_content", content);

  if (plan) {
    params.set("plan", plan);
  }

  if (typeof buildings === "number" && Number.isFinite(buildings)) {
    params.set("buildings", String(buildings));
  }

  if (typeof units === "number" && Number.isFinite(units)) {
    params.set("units", String(units));
  }

  if (source) {
    params.set("source", source);
  }

  if (offer) {
    params.set("offer", offer);
  }

  return url.toString();
}

/** @deprecated Use buildTrialLink instead. */
export const buildAuditLink = buildTrialLink;
