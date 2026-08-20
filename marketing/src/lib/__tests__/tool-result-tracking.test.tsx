import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getAnnualCamBucket,
  getLeasedSquareFeetBucket,
  type ToolResultViewedProperties,
  useTrackToolResultViewedOnce,
} from "@/lib/tool-result-tracking";

const { trackMarketingEventMock } = vi.hoisted(() => ({
  trackMarketingEventMock: vi.fn(),
}));

vi.mock("@/lib/posthog", () => ({
  trackMarketingEvent: trackMarketingEventMock,
}));

function TrackingHarness({
  properties,
}: {
  properties: ToolResultViewedProperties;
}) {
  const trackToolResultViewed = useTrackToolResultViewedOnce();

  return (
    <button type="button" onClick={() => trackToolResultViewed(properties)}>
      Track result
    </button>
  );
}

describe("tool result tracking", () => {
  beforeEach(() => {
    trackMarketingEventMock.mockClear();
  });

  it("buckets annual CAM into coarse ranges", () => {
    expect(getAnnualCamBucket(Number.NaN)).toBe("unknown");
    expect(getAnnualCamBucket(9_999)).toBe("under_10k");
    expect(getAnnualCamBucket(25_000)).toBe("10k_49k");
    expect(getAnnualCamBucket(75_000)).toBe("50k_99k");
    expect(getAnnualCamBucket(150_000)).toBe("100k_249k");
    expect(getAnnualCamBucket(500_000)).toBe("250k_999k");
    expect(getAnnualCamBucket(1_000_000)).toBe("1m_plus");
  });

  it("buckets leased square feet into coarse ranges", () => {
    expect(getLeasedSquareFeetBucket(0)).toBe("unknown");
    expect(getLeasedSquareFeetBucket(4_999)).toBe("under_5k");
    expect(getLeasedSquareFeetBucket(7_500)).toBe("5k_9k");
    expect(getLeasedSquareFeetBucket(10_000)).toBe("10k_24k");
    expect(getLeasedSquareFeetBucket(30_000)).toBe("25k_49k");
    expect(getLeasedSquareFeetBucket(75_000)).toBe("50k_99k");
    expect(getLeasedSquareFeetBucket(100_000)).toBe("100k_plus");
  });

  it("tracks a tool result only once for the current page session", async () => {
    const user = userEvent.setup();
    render(
      <TrackingHarness
        properties={{
          slug: "cam-overcharge-calculator",
          tool_type: "calculator",
          has_cap: true,
          annual_cam_bucket: "10k_49k",
          leased_sf_bucket: "10k_24k",
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: /track result/i }));
    await user.click(screen.getByRole("button", { name: /track result/i }));

    expect(trackMarketingEventMock).toHaveBeenCalledOnce();
    expect(trackMarketingEventMock).toHaveBeenCalledWith("tool_result_viewed", {
      slug: "cam-overcharge-calculator",
      tool_type: "calculator",
      has_cap: true,
      annual_cam_bucket: "10k_49k",
      leased_sf_bucket: "10k_24k",
    });
  });
});
