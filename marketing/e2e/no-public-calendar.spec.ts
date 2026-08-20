import { test } from "@playwright/test";

import {
  assertNoPublicCalendarExposure,
  assertSitemapHasNoPublicCalendarExposure,
} from "./no-public-calendar.shared";
import { PUBLIC_CALENDAR_ROUTES } from "./no-public-calendar-routes";

test.describe("public calendar exposure", () => {
  for (const route of PUBLIC_CALENDAR_ROUTES) {
    test(`does not expose Cal.com on ${route}`, async ({ page }) => {
      await assertNoPublicCalendarExposure(page, route, route);
    });
  }

  test("sitemap routes do not expose public calendar domains", async ({
    request,
  }) => {
    test.setTimeout(120000);
    await assertSitemapHasNoPublicCalendarExposure(request, {
      sitemapUrl: "/sitemap.xml",
      label: "local sitemap",
    });
  });
});
