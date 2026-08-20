import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { LeadMagnetExitIntentPopup } from "@/components/lead-capture/LeadMagnetExitIntentPopup";

vi.mock("next/navigation", () => ({
  usePathname: () => window.location.pathname,
}));

vi.mock("@/components/lead-capture/LeadCaptureForm", () => ({
  LeadCaptureForm: ({
    assetSlug,
    ctaLabel,
    onSuccess,
  }: {
    assetSlug: string;
    ctaLabel: string;
    onSuccess: () => void;
  }) => (
    <button
      type="button"
      data-testid="lead-capture-submit"
      data-asset-slug={assetSlug}
      onClick={onSuccess}
    >
      {ctaLabel}
    </button>
  ),
}));

vi.mock("@/lib/posthog", () => ({
  trackMarketingEvent: vi.fn(),
}));

function triggerExitIntent() {
  fireEvent.mouseOut(document, {
    clientY: 0,
    relatedTarget: null,
  });
}

beforeEach(() => {
  window.history.pushState({}, "", "/");
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe("LeadMagnetExitIntentPopup", () => {
  it("does not render before an exit-intent trigger", () => {
    render(<LeadMagnetExitIntentPopup />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("does not interrupt desktop visitors with an email gate", () => {
    render(<LeadMagnetExitIntentPopup />);
    triggerExitIntent();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("does not interrupt mobile visitors with an email gate", () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 390,
    });
    Object.defineProperty(window, "scrollY", {
      configurable: true,
      value: 700,
    });

    render(<LeadMagnetExitIntentPopup />);
    Object.defineProperty(window, "scrollY", {
      configurable: true,
      value: 580,
    });
    fireEvent.scroll(window);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("can still open in enabled test mode for behavior coverage", () => {
    render(<LeadMagnetExitIntentPopup enabled />);

    triggerExitIntent();

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /send me the resource/i }),
    ).toBeInTheDocument();
  });

  it("does not open on excluded paths even in enabled test mode", () => {
    window.history.pushState({}, "", "/privacy");
    render(<LeadMagnetExitIntentPopup enabled />);

    triggerExitIntent();

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("suppresses enabled popup after dismissal", () => {
    const { unmount } = render(<LeadMagnetExitIntentPopup enabled />);
    triggerExitIntent();

    fireEvent.click(screen.getByRole("button", { name: /maybe later/i }));
    unmount();

    render(<LeadMagnetExitIntentPopup enabled />);
    triggerExitIntent();

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("suppresses enabled popup after conversion", () => {
    const { unmount } = render(<LeadMagnetExitIntentPopup enabled />);
    triggerExitIntent();

    fireEvent.click(screen.getByTestId("lead-capture-submit"));
    unmount();
    window.sessionStorage.clear();

    render(<LeadMagnetExitIntentPopup enabled />);
    triggerExitIntent();

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
