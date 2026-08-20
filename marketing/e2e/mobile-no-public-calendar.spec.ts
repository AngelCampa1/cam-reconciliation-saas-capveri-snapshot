import { test } from "@playwright/test";

import {
  assertNoPublicCalendarAfterMobileNav,
  assertNoPublicCalendarExposure,
} from "./no-public-calendar.shared";
import {
  MOBILE_NAV_CALENDAR_ROUTES,
  PUBLIC_CALENDAR_ROUTES,
} from "./no-public-calendar-routes";

test.describe("mobile public calendar exposure", () => {
  for (const route of PUBLIC_CALENDAR_ROUTES) {
    test(`does not expose Cal.com on ${route}`, async ({ page }) => {
      await assertNoPublicCalendarExposure(page, route, route);
    });
  }

  for (const route of MOBILE_NAV_CALENDAR_ROUTES) {
    test(`does not expose Cal.com after opening mobile nav on ${route}`, async ({
      page,
    }) => {
      await assertNoPublicCalendarExposure(page, route, route);
      await assertNoPublicCalendarAfterMobileNav(page, route, {
        requireToggle: true,
      });
    });
  }
});
