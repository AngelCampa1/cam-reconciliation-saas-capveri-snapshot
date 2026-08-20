import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockCapture, mockIdentify } = vi.hoisted(() => ({
  mockCapture: vi.fn(),
  mockIdentify: vi.fn(),
}));
vi.mock("posthog-js", () => ({
  default: {
    __loaded: false,
    capture: mockCapture,
    identify: mockIdentify,
  },
}));

import {
  getCountBucket,
  getEmailDomain,
  getSafeMarketingPageSearch,
  getPageTaxonomy,
  getStatusBucket,
  identifyMarketingLead,
  trackMarketingEvent,
} from "@/lib/posthog";

import posthog from "posthog-js";

describe("trackMarketingEvent", () => {
  beforeEach(() => {
    mockCapture.mockClear();
    mockIdentify.mockClear();
    (posthog as unknown as { __loaded: boolean }).__loaded = false;
    window.localStorage.clear();
    window.history.replaceState(
      {},
      "",
      "/pricing?utm_source=google&utm_medium=cpc&utm_campaign=q2&ve_product=capveri&ve_icp=cv_property_controllers&ve_campaign_id=capveri-controller-presend-qa-2026_06-01&ve_variant=plain_founder&ve_step=4&ve_branding=plain",
    );
  });

  it("is a no-op when posthog is not loaded", () => {
    trackMarketingEvent("cta_clicked", { location: "nav_desktop" });
    expect(mockCapture).not.toHaveBeenCalled();
  });

  it("calls posthog.capture when posthog is loaded", () => {
    (posthog as unknown as { __loaded: boolean }).__loaded = true;

    trackMarketingEvent("cta_clicked", {
      button_text: "Start Free Trial",
      location: "nav_desktop",
    });

    expect(mockCapture).toHaveBeenCalledOnce();
    expect(mockCapture).toHaveBeenCalledWith(
      "cta_clicked",
      expect.objectContaining({
        button_text: "Start Free Trial",
        location: "nav_desktop",
        source_app: "marketing",
        page_path: "/pricing",
        page_type: "pricing",
        funnel_stage: "decision",
        utm_source: "google",
        latest_utm_source: "google",
        first_touch_utm_source: "google",
        utm_medium: "cpc",
        utm_campaign: "q2",
        ve_product: "capveri",
        ve_icp: "cv_property_controllers",
        ve_campaign_id: "capveri-controller-presend-qa-2026_06-01",
        ve_variant: "plain_founder",
        ve_step: "4",
        ve_branding: "plain",
        latest_ve_campaign_id: "capveri-controller-presend-qa-2026_06-01",
        first_touch_ve_campaign_id: "capveri-controller-presend-qa-2026_06-01",
      }),
    );
  });

  it("calls posthog.capture without properties when none provided", () => {
    (posthog as unknown as { __loaded: boolean }).__loaded = true;

    trackMarketingEvent("pricing_viewed");

    expect(mockCapture).toHaveBeenCalledWith(
      "pricing_viewed",
      expect.objectContaining({
        source_app: "marketing",
        page_path: "/pricing",
      }),
    );
  });

  it("strips sensitive properties before capturing marketing events", () => {
    (posthog as unknown as { __loaded: boolean }).__loaded = true;

    trackMarketingEvent("cta_clicked", {
      location: "hero",
      email: "owner@example.com",
      contactEmail: "not-email-token",
      phone_number: "+1 (555) 111-2222",
      nested: {
        fullName: "Jane Doe",
        email_domain: "example.com",
        note: "Send this to ops@example.com",
      },
    });

    const properties = mockCapture.mock.calls[0]?.[1] as Record<
      string,
      unknown
    >;
    expect(properties).toMatchObject({
      location: "hero",
      nested: { email_domain: "example.com" },
      source_app: "marketing",
    });
    expect(properties).not.toHaveProperty("email");
    expect(properties).not.toHaveProperty("contactEmail");
    expect(properties).not.toHaveProperty("phone_number");
  });

  it("identifies marketing leads with the backend distinct ID and attribution", async () => {
    (posthog as unknown as { __loaded: boolean }).__loaded = true;

    identifyMarketingLead("Controller@Example.com", {
      lead_type: "content_download",
    });

    await vi.waitFor(() => {
      expect(mockIdentify).toHaveBeenCalledWith(
        "lead:example.com:25f36baf342ae85c",
        expect.objectContaining({
          lead_email_domain: "example.com",
          lead_type: "content_download",
          source_app: "marketing",
          first_touch_landing_page: "/pricing",
        }),
      );
    });
    expect(mockIdentify.mock.calls[0]?.[1]).not.toHaveProperty("email");
  });

  it("strips sensitive query values before pageview capture", () => {
    expect(
      getSafeMarketingPageSearch(
        "?utm_source=owner@example.com&utm_medium=cpc&phone_number=%2B15551112222",
      ),
    ).toBe("?utm_medium=cpc");
  });

  it("strips sensitive caller properties before identifying leads", async () => {
    (posthog as unknown as { __loaded: boolean }).__loaded = true;

    identifyMarketingLead("Controller@Example.com", {
      lead_type: "content_download",
      contactName: "Jane Doe",
      email_address: "owner@example.com",
      lead_email_domain: "example.com",
    });

    await vi.waitFor(() => {
      expect(mockIdentify).toHaveBeenCalledWith(
        "lead:example.com:25f36baf342ae85c",
        expect.objectContaining({
          lead_type: "content_download",
          lead_email_domain: "example.com",
        }),
      );
    });

    const properties = mockIdentify.mock.calls[0]?.[1] as Record<
      string,
      unknown
    >;
    expect(properties).toMatchObject({
      lead_type: "content_download",
      lead_email_domain: "example.com",
    });
    expect(properties).not.toHaveProperty("contactName");
    expect(properties).not.toHaveProperty("email_address");
  });

  it("drops malformed email domains and sanitizes context PII before capture", () => {
    (posthog as unknown as { __loaded: boolean }).__loaded = true;
    window.history.replaceState(
      {},
      "",
      "/contact?utm_source=owner@example.com&utm_campaign=%2B1%20(555)%20111-2222&utm_medium=cpc",
    );
    window.localStorage.setItem(
      "capveri_first_touch_attribution",
      JSON.stringify({
        first_touch_landing_page: "/contact",
        first_touch_utm_source: "buyer@example.com",
        first_touch_utm_medium: "cpc",
      }),
    );

    expect(getEmailDomain("jane@company.com Jane Smith")).toBeUndefined();

    trackMarketingEvent("form_submit_failed", {
      form_type: "contact",
      email_domain: "company.com Jane Smith",
      error_type: "validation",
    });

    const properties = mockCapture.mock.calls[0]?.[1] as Record<
      string,
      unknown
    >;
    expect(properties).toMatchObject({
      form_type: "contact",
      error_type: "validation",
      source_app: "marketing",
      utm_medium: "cpc",
    });
    expect(properties).not.toHaveProperty("email_domain");
    expect(properties).not.toHaveProperty("utm_source");
    expect(properties).not.toHaveProperty("utm_campaign");
    expect(properties).not.toHaveProperty("first_touch_utm_source");
  });

  it("classifies high-intent SEO and comparison page taxonomy", () => {
    expect(getPageTaxonomy("/vs/yardi")).toEqual({
      page_type: "comparison",
      comparison_slug: "yardi",
      competitor_slug: "yardi",
      funnel_stage: "decision",
    });
    expect(getPageTaxonomy("/alternatives/mri")).toEqual({
      page_type: "alternative",
      alternative_slug: "mri",
      competitor_slug: "mri",
      funnel_stage: "decision",
    });
    expect(getPageTaxonomy("/cam-audit-software")).toEqual({
      page_type: "product_feature",
      feature_slug: "cam-audit-software",
      funnel_stage: "consideration",
    });
    expect(getPageTaxonomy("/switch/appfolio")).toEqual({
      page_type: "switch_guide",
      switch_slug: "appfolio",
      competitor_slug: "appfolio",
      funnel_stage: "decision",
    });
    expect(getPageTaxonomy("/solutions/controllers")).toEqual({
      page_type: "solution",
      solution_slug: "controllers",
      funnel_stage: "consideration",
    });
    expect(getPageTaxonomy("/integrations/yardi")).toEqual({
      page_type: "integration",
      integration_slug: "yardi",
      funnel_stage: "consideration",
    });
    expect(getPageTaxonomy("/best/cam-software")).toEqual({
      page_type: "best_page",
      best_slug: "cam-software",
      funnel_stage: "decision",
    });
    expect(getPageTaxonomy("/product/features/cap-audit")).toEqual({
      page_type: "product_feature",
      feature_slug: "cap-audit",
      funnel_stage: "consideration",
    });
  });

  it("builds stable status and count buckets for form friction events", () => {
    expect(getStatusBucket(429)).toBe("rate_limit");
    expect(getStatusBucket(503)).toBe("5xx");
    expect(getStatusBucket(undefined)).toBe("unknown");
    expect(getCountBucket("1")).toBe("1");
    expect(getCountBucket("7")).toBe("6-10");
    expect(getCountBucket("250")).toBe("100+");
    expect(getCountBucket("")).toBe("unknown");
  });
});
