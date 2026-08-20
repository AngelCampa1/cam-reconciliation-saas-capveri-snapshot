import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  calculateOverchargeEstimates,
  CamOverchargeCalculator,
} from "../CamOverchargeCalculatorClient";

const { trackMarketingEventMock } = vi.hoisted(() => ({
  trackMarketingEventMock: vi.fn(),
}));

vi.mock("@/lib/posthog", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/posthog")>("@/lib/posthog");

  return {
    ...actual,
    trackMarketingEvent: trackMarketingEventMock,
  };
});

const unlockStorageKey =
  "capveri_calculator_unlocked:cam-overcharge-calculator";

beforeEach(() => {
  localStorage.clear();
  trackMarketingEventMock.mockClear();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));
});

describe("calculateOverchargeEstimates", () => {
  it("returns deterministic category ranges and omits cap violation when no cap exists", () => {
    const first = calculateOverchargeEstimates({
      leasedSF: 10_000,
      annualCAM: 25_000,
      hasCap: false,
    });
    const second = calculateOverchargeEstimates({
      leasedSF: 10_000,
      annualCAM: 25_000,
      hasCap: false,
    });

    expect(second).toEqual(first);
    expect(first.totalLow).toBe(380);
    expect(first.totalHigh).toBe(1520);
    expect(first.categories).toHaveLength(6);
    expect(
      first.categories.find(
        (category) => category.category === "Cap violation",
      ),
    ).toMatchObject({ lowEstimate: 0, highEstimate: 0, probability: 0 });
  });

  it("includes cap violation estimates when the lease has a cap", () => {
    const result = calculateOverchargeEstimates({
      leasedSF: 10_000,
      annualCAM: 25_000,
      buildingTotalSF: 100_000,
      hasCap: true,
      capRate: 0.05,
    });

    expect(result.totalLow).toBe(470);
    expect(result.totalHigh).toBe(1880);
    expect(
      result.categories.find(
        (category) => category.category === "Cap violation",
      ),
    ).toMatchObject({ lowEstimate: 90, highEstimate: 360, probability: 0.08 });
  });

  it("scales estimates with lease size and building denominator", () => {
    const smallSuite = calculateOverchargeEstimates({
      leasedSF: 2_500,
      annualCAM: 25_000,
      buildingTotalSF: 100_000,
      hasCap: false,
    });
    const largeSuite = calculateOverchargeEstimates({
      leasedSF: 40_000,
      annualCAM: 25_000,
      buildingTotalSF: 100_000,
      hasCap: false,
    });
    const proRataAtTenPercent = calculateOverchargeEstimates({
      leasedSF: 10_000,
      annualCAM: 25_000,
      buildingTotalSF: 100_000,
      hasCap: false,
    }).categories.find(
      (category) => category.category === "Pro-rata share error",
    );
    const proRataAtTwentyPercent = calculateOverchargeEstimates({
      leasedSF: 10_000,
      annualCAM: 25_000,
      buildingTotalSF: 50_000,
      hasCap: false,
    }).categories.find(
      (category) => category.category === "Pro-rata share error",
    );

    expect(largeSuite.totalHigh).toBeGreaterThan(smallSuite.totalHigh);
    expect(proRataAtTwentyPercent?.highEstimate).toBeGreaterThan(
      proRataAtTenPercent?.highEstimate ?? 0,
    );
  });

  it("raises cap violation exposure for tighter caps", () => {
    const looseCap = calculateOverchargeEstimates({
      leasedSF: 10_000,
      annualCAM: 25_000,
      hasCap: true,
      capRate: 0.15,
    }).categories.find((category) => category.category === "Cap violation");
    const tightCap = calculateOverchargeEstimates({
      leasedSF: 10_000,
      annualCAM: 25_000,
      hasCap: true,
      capRate: 0.03,
    }).categories.find((category) => category.category === "Cap violation");

    expect(tightCap?.highEstimate).toBeGreaterThan(looseCap?.highEstimate ?? 0);
  });
});

describe("CamOverchargeCalculator", () => {
  it("renders breadcrumb, form fields, and calculator structured data", () => {
    const { container } = render(<CamOverchargeCalculator />);

    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(screen.getByRole("link", { name: "Tools" })).toHaveAttribute(
      "href",
      "/tools",
    );
    expect(screen.getAllByText("Tenant Challenge Exposure Calculator")[0]).toBeVisible();
    expect(screen.getByLabelText(/leased square footage/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/annual CAM amount/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/building total RSF/i)).toBeInTheDocument();
    expect(
      screen.getByLabelText(/this lease has a CAM cap/i),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/cap rate/i)).not.toBeInTheDocument();

    const jsonLdScripts = container.querySelectorAll(
      'script[type="application/ld+json"]',
    );
    expect(jsonLdScripts).toHaveLength(2);
    expect(JSON.parse(jsonLdScripts[0].textContent ?? "{}")).toMatchObject({
      "@type": "WebApplication",
      name: "Tenant Challenge Exposure Calculator",
    });
    expect(JSON.parse(jsonLdScripts[1].textContent ?? "{}")).toMatchObject({
      "@type": "FAQPage",
    });
  });

  it("validates inputs and conditionally shows the cap rate field", async () => {
    const user = userEvent.setup();
    render(<CamOverchargeCalculator />);

    await user.click(screen.getByLabelText(/this lease has a CAM cap/i));
    expect(screen.getByLabelText(/CAM cap limit/i)).toBeInTheDocument();

    await user.type(screen.getByLabelText(/leased square footage/i), "50");
    await user.type(screen.getByLabelText(/annual CAM amount/i), "0");
    await user.type(screen.getByLabelText(/CAM cap limit/i), "30");
    await user.click(
      screen.getByRole("button", { name: /estimate overcharge exposure/i }),
    );

    expect(
      await screen.findByText(/must be at least 100 SF/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/must be greater than \$0/i)).toBeInTheDocument();
    expect(screen.getByText(/must be under 25%/i)).toBeInTheDocument();
  });

  it("shows gated preview, unlocks full results, and links to the audit wizard", async () => {
    const user = userEvent.setup();
    render(<CamOverchargeCalculator />);

    await user.type(screen.getByLabelText(/leased square footage/i), "10000");
    await user.type(screen.getByLabelText(/annual CAM amount/i), "25000");
    await user.click(
      screen.getByRole("button", { name: /estimate overcharge exposure/i }),
    );

    expect(await screen.findByText("$380 - $1,520")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /see full breakdown/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Capital expense misclassification")).toBeNull();

    await user.click(
      screen.getByRole("button", { name: /see full breakdown/i }),
    );
    await user.type(screen.getByLabelText(/first name/i), "Jane");
    await user.type(screen.getByLabelText(/work email/i), "jane@example.com");
    await user.click(
      screen.getByRole("button", { name: /see full breakdown/i }),
    );

    await waitFor(() => {
      expect(localStorage.getItem(unlockStorageKey)).toBe("true");
    });
    expect(screen.getByText("Capital expense misclassification")).toBeVisible();
    expect(screen.queryByText("Cap violation")).toBeNull();
    expect(
      screen.getAllByText(/industry-average error rates/i).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByRole("link", { name: /check my CAM charges/i }),
    ).toHaveAttribute("href", "/cam-audit");

    const rows = within(screen.getByRole("table")).getAllByRole("row");
    expect(rows).toHaveLength(6);
  });

  it("tracks the first successful result calculation with safe buckets only", async () => {
    const user = userEvent.setup();
    render(<CamOverchargeCalculator />);

    await user.type(screen.getByLabelText(/leased square footage/i), "10000");
    await user.type(screen.getByLabelText(/annual CAM amount/i), "25000");
    await user.click(screen.getByLabelText(/this lease has a CAM cap/i));
    await user.type(screen.getByLabelText(/CAM cap limit/i), "5");
    await user.click(
      screen.getByRole("button", { name: /estimate overcharge exposure/i }),
    );

    expect(trackMarketingEventMock).toHaveBeenCalledOnce();
    expect(trackMarketingEventMock).toHaveBeenCalledWith("tool_result_viewed", {
      slug: "cam-overcharge-calculator",
      tool_type: "calculator",
      has_cap: true,
      annual_cam_bucket: "10k_49k",
      leased_sf_bucket: "10k_24k",
    });

    await user.clear(screen.getByLabelText(/leased square footage/i));
    await user.type(screen.getByLabelText(/leased square footage/i), "40000");
    await user.click(
      screen.getByRole("button", { name: /estimate overcharge exposure/i }),
    );

    expect(trackMarketingEventMock).toHaveBeenCalledOnce();
  });

  it("shows full results immediately for returning visitors", async () => {
    localStorage.setItem(unlockStorageKey, "true");
    const user = userEvent.setup();
    render(<CamOverchargeCalculator />);

    await user.type(screen.getByLabelText(/leased square footage/i), "10000");
    await user.type(screen.getByLabelText(/annual CAM amount/i), "25000");
    await user.click(screen.getByLabelText(/this lease has a CAM cap/i));
    await user.type(screen.getByLabelText(/CAM cap limit/i), "5");
    await user.click(
      screen.getByRole("button", { name: /estimate overcharge exposure/i }),
    );

    expect(await screen.findByText("$470 - $1,880")).toBeVisible();
    expect(screen.getByText("Cap violation")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /see full breakdown/i }),
    ).toBeNull();
  });

  it("clears a shown estimate when an input changes", async () => {
    const user = userEvent.setup();
    render(<CamOverchargeCalculator />);

    await user.type(screen.getByLabelText(/leased square footage/i), "10000");
    await user.type(screen.getByLabelText(/annual CAM amount/i), "25000");
    await user.click(
      screen.getByRole("button", { name: /estimate overcharge exposure/i }),
    );

    expect(await screen.findByText("$380 - $1,520")).toBeInTheDocument();

    // Editing any input must invalidate the stale estimate so the displayed
    // range never contradicts the numbers on screen.
    await user.type(screen.getByLabelText(/annual CAM amount/i), "0");

    expect(screen.queryByText("$380 - $1,520")).toBeNull();
    expect(
      screen.getByText(/enter the lease and CAM details/i),
    ).toBeInTheDocument();
  });
});
