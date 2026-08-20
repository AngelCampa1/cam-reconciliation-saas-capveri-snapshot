// Shared styled email layout for CapVeri transactional emails.
//
// Mirrors the Python backend's Jinja `_base.html` / `_components.html` so that
// emails sent from the Cloudflare Worker render with the same branded card,
// header logo, gold accent stripe, footer, and pill CTA button — instead of the
// bare unstyled HTML the worker previously produced.
//
// All styles are inline (email clients strip <style> blocks), values are taken
// from `design-tokens.json`.

export const tokens = {
  FONT_FAMILY:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  PRIMARY: "#304476",
  WARNING: "#F59E0B",
  TEXT_PRIMARY: "#0f172a",
  TEXT_SECONDARY: "#64748b",
  TEXT_INVERSE: "#ffffff",
  BACKGROUND: "#ffffff",
  SURFACE: "#f8fafc",
  BORDER: "#e2e8f0",
  RADIUS_MD: "8px",
  RADIUS_BUTTON: "9999px",
  SPACE_MD: "16px",
  SPACE_LG: "24px",
  SPACE_XL: "32px",
  SPACE_2XL: "48px",
} as const;

const t = tokens;

export function logoUrl(marketingBaseUrl: string): string {
  return `${marketingBaseUrl.replace(/\/+$/u, "")}/email-logo.png`;
}

export type EmailShellOptions = {
  /** Inner HTML for the content card (already escaped where needed). */
  content: string;
  marketingBaseUrl: string;
  /** When provided, an Unsubscribe link is appended to the footer. */
  unsubscribeUrl?: string | null;
};

/** Wrap content HTML in the branded CapVeri email card. */
export function renderEmailShell(options: EmailShellOptions): string {
  const { content, marketingBaseUrl, unsubscribeUrl } = options;
  const helpUrl = `${marketingBaseUrl.replace(/\/+$/u, "")}/help`;
  const year = new Date().getUTCFullYear();

  const unsubscribe =
    unsubscribeUrl != null && unsubscribeUrl !== ""
      ? `&nbsp;&bull;&nbsp;<a href="${escapeAttr(unsubscribeUrl)}" style="color: ${t.TEXT_SECONDARY};">Unsubscribe</a>`
      : "";

  return [
    '<!doctype html><html lang="en"><head>',
    '<meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    "<title>CapVeri</title></head>",
    `<body style="margin: 0; padding: 0; background-color: ${t.SURFACE}; font-family: ${t.FONT_FAMILY};">`,
    `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: ${t.SURFACE};"><tr>`,
    `<td align="center" style="padding: ${t.SPACE_2XL} ${t.SPACE_MD};">`,
    `<table role="presentation" cellpadding="0" cellspacing="0" width="600" style="background-color: ${t.BACKGROUND}; border: 1px solid ${t.BORDER}; border-radius: ${t.RADIUS_MD}; max-width: 600px; width: 100%;">`,
    // Header with logo
    `<tr><td align="center" style="background-color: ${t.PRIMARY}; border-radius: ${t.RADIUS_MD} ${t.RADIUS_MD} 0 0; padding: ${t.SPACE_LG} ${t.SPACE_XL};">`,
    `<img src="${escapeAttr(logoUrl(marketingBaseUrl))}" alt="CapVeri" height="32" style="display: block; height: 32px; margin: 0 auto;"></td></tr>`,
    // Gold accent stripe
    `<tr><td style="background-color: ${t.WARNING}; font-size: 0; line-height: 0; height: 3px;">&nbsp;</td></tr>`,
    // Content
    `<tr><td style="padding: ${t.SPACE_XL};">${content}</td></tr>`,
    // Footer
    `<tr><td style="border-top: 1px solid ${t.BORDER}; padding: ${t.SPACE_LG} ${t.SPACE_XL};">`,
    `<p style="color: ${t.TEXT_SECONDARY}; font-family: ${t.FONT_FAMILY}; font-size: 12px; margin: 0; text-align: center;">`,
    `&copy; ${year} CapVeri &nbsp;&bull;&nbsp; <a href="${escapeAttr(helpUrl)}" style="color: ${t.TEXT_SECONDARY};">Help &amp; Support</a>${unsubscribe}`,
    "</p></td></tr>",
    "</table></td></tr></table></body></html>",
  ].join("");
}

/** Heading element matching the Python templates' h2 style. */
export function heading(text: string): string {
  return `<h2 style="color: ${t.TEXT_PRIMARY}; font-family: ${t.FONT_FAMILY}; font-size: 22px; margin: 0 0 ${t.SPACE_MD};">${escapeHtml(text)}</h2>`;
}

/** Body paragraph. Pass `html: true` to allow already-built inner markup. */
export function paragraph(
  text: string,
  options: { secondary?: boolean; html?: boolean } = {},
): string {
  const color = options.secondary ? t.TEXT_SECONDARY : t.TEXT_PRIMARY;
  const size = options.secondary ? "13px" : "15px";
  const body = options.html ? text : escapeHtml(text);
  return `<p style="color: ${color}; font-family: ${t.FONT_FAMILY}; font-size: ${size}; line-height: 1.6; margin: 0 0 ${t.SPACE_MD};">${body}</p>`;
}

/** Pill CTA button matching `_components.html` button macro. */
export function pillButton(url: string, label: string): string {
  return [
    `<p style="margin: 0 0 ${t.SPACE_LG};">`,
    `<a href="${escapeAttr(url)}" style="background-color: ${t.PRIMARY}; border-radius: ${t.RADIUS_BUTTON}; color: ${t.TEXT_INVERSE}; display: inline-block; font-family: ${t.FONT_FAMILY}; font-size: 15px; font-weight: 600; line-height: 1; padding: ${t.SPACE_MD} ${t.SPACE_XL}; text-decoration: none;">${escapeHtml(label)}</a>`,
    "</p>",
  ].join("");
}

/** Data table for label/value notification emails. */
export function dataTable(rows: Array<[string, string | null]>): string {
  const cells = rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding: 6px ${t.SPACE_MD} 6px 0; color: ${t.TEXT_SECONDARY}; font-family: ${t.FONT_FAMILY}; font-size: 13px; font-weight: 600; vertical-align: top;">${escapeHtml(label)}</td><td style="padding: 6px 0; color: ${t.TEXT_PRIMARY}; font-family: ${t.FONT_FAMILY}; font-size: 14px;">${escapeHtml(value ?? "")}</td></tr>`,
    )
    .join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%">${cells}</table>`;
}

export function divider(): string {
  return `<hr style="border: none; border-top: 1px solid ${t.BORDER}; margin: 0 0 ${t.SPACE_LG};">`;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&#39;");
}

export function escapeAttr(value: string): string {
  return escapeHtml(value);
}
