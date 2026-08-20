import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { HowItWorksSection } from "@/components/landing/HowItWorksSection";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

beforeEach(() => {
  // Must use a regular function (not arrow) so it can be called with `new`
  function MockIO(this: {
    observe: ReturnType<typeof vi.fn>;
    unobserve: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    takeRecords: ReturnType<typeof vi.fn>;
    root: null;
    rootMargin: string;
    thresholds: number[];
  }) {
    this.observe = vi.fn();
    this.unobserve = vi.fn();
    this.disconnect = vi.fn();
    this.takeRecords = vi.fn();
    this.root = null;
    this.rootMargin = "";
    this.thresholds = [];
  }
  global.IntersectionObserver =
    MockIO as unknown as typeof IntersectionObserver;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("HowItWorksSection", () => {
  it("renders with id='how-it-works'", () => {
    const { container } = render(<HowItWorksSection />);
    expect(container.querySelector("#how-it-works")).not.toBeNull();
  });

  it("renders the section heading", () => {
    render(<HowItWorksSection />);
    expect(
      screen.getByRole("heading", { name: /how capveri works/i }),
    ).toBeInTheDocument();
  });

  it("renders all 4 step titles", () => {
    render(<HowItWorksSection />);
    expect(screen.getByText("Upload the source files")).toBeInTheDocument();
    expect(screen.getByText("Map lease terms")).toBeInTheDocument();
    expect(screen.getByText("Run CAM calculations")).toBeInTheDocument();
    expect(screen.getByText("Export tenant-ready support")).toBeInTheDocument();
  });

  it("mentions current systems and lease-term mapping", () => {
    render(<HowItWorksSection />);
    expect(
      screen.getByText(/from yardi, mri, or your current system/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/recovery pools, caps, base years, and exclusions/i),
    ).toBeInTheDocument();
  });

  it("clarifies calculations are deterministic", () => {
    render(<HowItWorksSection />);
    expect(screen.getByText(/run deterministic logic/i)).toBeInTheDocument();
  });

  it("renders step numbers 1-4", () => {
    render(<HowItWorksSection />);
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
  });

  it("renders product tour CTA link", () => {
    render(<HowItWorksSection />);
    expect(
      screen.getByRole("link", { name: /see the product tour/i }),
    ).toHaveAttribute("href", "/product-tour");
  });

  it("renders mobile arrows between steps (not after last step)", () => {
    const { container } = render(<HowItWorksSection />);
    // 3 arrows between 4 steps
    const arrows = container.querySelectorAll(".md\\:hidden svg");
    expect(arrows.length).toBe(3);
  });

  it("renders step items with animate-on-scroll class", () => {
    const { container } = render(<HowItWorksSection />);
    const animated = container.querySelectorAll(".animate-on-scroll");
    expect(animated.length).toBe(4);
  });
});
