import { describe, expect, it } from "vitest";
import { LAUNCH_OFFER } from "@/config/launch-offer";
import { buildTrialLink, buildAuditLink } from "@/lib/auditLink";

describe("buildTrialLink", () => {
  it("builds register URL with default UTM fields", () => {
    const href = buildTrialLink({ content: "hero" });

    expect(href).toContain("/auth/register");
    expect(href).toContain("utm_source=marketing_site");
    expect(href).toContain("utm_medium=website");
    expect(href).toContain("utm_campaign=free_trial");
    expect(href).toContain("utm_content=hero");
    expect(href).toContain(`offer=${LAUNCH_OFFER.code}`);
  });

  it("supports overriding the default limited offer", () => {
    const href = buildTrialLink({
      content: "partner_campaign",
      offer: "PARTNER25",
    });

    expect(href).toContain("offer=PARTNER25");
    expect(href).not.toContain(`offer=${LAUNCH_OFFER.code}`);
  });

  it("can omit the limited offer explicitly", () => {
    const href = buildTrialLink({
      content: "pricing_closed_offer",
      offer: null,
    });

    expect(href).not.toContain("offer=");
  });

  it("includes optional plan and buildings values", () => {
    const href = buildTrialLink({
      content: "pricing_pro",
      plan: "pro",
      buildings: 12,
    });

    expect(href).toContain("plan=pro");
    expect(href).toContain("buildings=12");
  });

  it("supports overriding campaign", () => {
    const href = buildTrialLink({
      content: "yardi_vs",
      campaign: "yardi_comparison",
    });

    expect(href).toContain("utm_campaign=yardi_comparison");
    expect(href).toContain("utm_content=yardi_vs");
  });
});

describe("buildAuditLink (deprecated alias)", () => {
  it("is the same function as buildTrialLink", () => {
    expect(buildAuditLink).toBe(buildTrialLink);
  });
});
