export const PUBLIC_CALENDAR_ROUTES = [
  "/",
  "/pricing",
  "/contact",
  "/help",
  "/about",
  "/product",
  "/product-tour",
  "/solutions",
  "/integrations",
  "/switch",
  "/vs",
  "/alternatives",
  "/case-studies",
  "/sample-report",
  "/roi",
  "/tools",
  "/tools/cam-billing-error-estimator",
  "/tools/cam-gross-up-calculator",
  "/resources",
  "/resources/calendar",
  "/resources/cam-close-calendar",
  "/resources/tenant-cam-dispute",
  "/blog",
  "/glossary",
  "/checkout",
] as const;

export const HIGH_INTENT_AI_SDR_ROUTES = [
  "/pricing",
  "/contact",
  "/sample-report",
  "/roi",
  "/product-tour",
  "/tools",
  "/tools/cam-billing-error-estimator",
] as const;

export const MOBILE_NAV_CALENDAR_ROUTES = PUBLIC_CALENDAR_ROUTES.filter(
  (route) => route !== "/checkout",
);
