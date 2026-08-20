import { publicKnowledge } from "@/generated/public-knowledge";

export const SITE_URL = publicKnowledge.company.siteUrl;
export const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? publicKnowledge.company.appUrl;
export const TRIAL_COPY = publicKnowledge.pricing.display.trialLabel;

export function buildSiteUrl(path = "/"): string {
  if (path === "" || path === "/") {
    return SITE_URL;
  }
  return new URL(path, SITE_URL).toString();
}

export function buildAppUrl(path = "/"): string {
  return new URL(path, APP_URL).toString();
}
