import { expect, type APIRequestContext, type Page } from "@playwright/test";

const PUBLIC_CALENDAR_HOSTS = ["cal.com", "calendly.com"] as const;
export const PUBLIC_CALENDAR_TEXT = /\b(?:https?:\/\/)?(?:[\w-]+\.)?(?:cal\.com|calendly\.com)\b/iu;

export function isPublicCalendarUrl(rawUrl: string | null): boolean {
  if (!rawUrl) {
    return false;
  }

  let url: URL;
  try {
    url = new URL(rawUrl, "https://www.capveri.com");
  } catch {
    return PUBLIC_CALENDAR_TEXT.test(rawUrl);
  }

  const hostname = url.hostname.toLowerCase();
  return PUBLIC_CALENDAR_HOSTS.some(
    (host) => hostname === host || hostname.endsWith(`.${host}`),
  );
}

export async function assertNoPublicCalendarExposure(
  page: Page,
  target: string,
  label: string,
  afterLoad?: (page: Page) => Promise<void>,
): Promise<void> {
  const calendarRequests: string[] = [];
  page.on("request", (request) => {
    const url = request.url();
    if (isPublicCalendarUrl(url)) {
      calendarRequests.push(url);
    }
  });

  const response = await page.goto(target, { waitUntil: "domcontentloaded" });
  expect(response, `${label}: route did not return a response`).not.toBeNull();
  expect(response!.status(), `${label}: route returned an error`).toBeLessThan(
    400,
  );

  await page.waitForTimeout(1500);
  if (afterLoad) {
    await afterLoad(page);
    await page.waitForTimeout(1500);
  }

  const calendarDomReferences = await page.evaluate(() => {
    const references: string[] = [];
    const selectors = [
      ["a[href]", "href"],
      ["iframe[src]", "src"],
      ["script[src]", "src"],
      ["form[action]", "action"],
    ] as const;
    for (const [selector, attr] of selectors) {
      for (const node of document.querySelectorAll(selector)) {
        const value = node.getAttribute(attr);
        if (value) {
          references.push(value);
        }
      }
    }
    return references;
  });

  const badDomReferences = calendarDomReferences.filter(isPublicCalendarUrl);
  expect(
    badDomReferences,
    `${label}: public calendar links/scripts/forms should not be present`,
  ).toEqual([]);

  expect(await page.content(), `${label}: page HTML leaked calendar domain`).not
    .toMatch(PUBLIC_CALENDAR_TEXT);
  expect(
    calendarRequests,
    `${label}: browser should not call public calendar hosts`,
  ).toEqual([]);
}

export async function assertSitemapHasNoPublicCalendarExposure(
  request: APIRequestContext,
  options: { sitemapUrl: string; routeOrigin?: string; label: string },
): Promise<void> {
  const sitemapResponse = await request.get(options.sitemapUrl);
  expect(
    sitemapResponse.status(),
    `${options.label}: sitemap should be reachable`,
  ).toBeLessThan(400);

  const sitemapXml = await sitemapResponse.text();
  expect(
    sitemapXml,
    `${options.label}: sitemap XML leaked calendar domain`,
  ).not.toMatch(PUBLIC_CALENDAR_TEXT);

  const routeTargets = Array.from(
    sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/giu),
    (match) => match[1]?.trim() ?? "",
  ).filter(Boolean);
  expect(routeTargets.length, `${options.label}: sitemap should list routes`)
    .toBeGreaterThan(0);

  const failures: string[] = [];
  for (const target of routeTargets) {
    let routeTarget = target;
    if (!options.routeOrigin) {
      routeTarget = new URL(target).pathname;
    } else if (!target.startsWith(options.routeOrigin)) {
      routeTarget = `${options.routeOrigin}${new URL(target).pathname}`;
    }

    const response = await request.get(routeTarget);
    const body = await response.text();
    if (response.status() >= 400 || PUBLIC_CALENDAR_TEXT.test(body)) {
      failures.push(`${routeTarget} status=${response.status()}`);
    }
  }

  expect(failures, `${options.label}: sitemap routes should not leak calendar domains`)
    .toEqual([]);
}

export async function assertNoPublicCalendarAfterMobileNav(
  page: Page,
  label: string,
  options: { requireToggle?: boolean } = {},
): Promise<void> {
  const toggle = page.getByRole("button", { name: /open menu/i });
  if (!(await toggle.isVisible().catch(() => false))) {
    expect(
      options.requireToggle,
      `${label}: mobile menu button should be visible`,
    ).not.toBe(true);
    return;
  }

  await toggle.click();
  await expect(page.getByRole("button", { name: /close menu/i })).toBeVisible();
  expect(await page.content(), `${label}: mobile nav leaked calendar domain`).not
    .toMatch(PUBLIC_CALENDAR_TEXT);
}

export async function assertAiSdrWidgetReadyAndOpened(
  page: Page,
  label: string,
): Promise<void> {
  await page.waitForFunction(
    () => typeof window.AiSdr?.init === "function",
    undefined,
    { timeout: 15000 },
  );

  const widgetRoot = page.locator("[data-ai-sdr-widget]");
  await expect(widgetRoot, `${label}: AI-SDR widget root should render`)
    .toBeVisible({ timeout: 15000 });

  const launcher = page.locator("[data-ai-sdr-launcher]");
  await expect(launcher, `${label}: AI-SDR launcher should render`)
    .toBeVisible({ timeout: 15000 });
  await launcher.click();
  await expect(launcher, `${label}: AI-SDR launcher should open`)
    .toHaveAttribute("aria-expanded", "true", { timeout: 10000 });
  await page.waitForTimeout(3000);
}
