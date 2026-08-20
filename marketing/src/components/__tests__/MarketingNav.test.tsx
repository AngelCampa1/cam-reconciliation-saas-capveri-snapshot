import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MarketingNav } from "../MarketingNav";

const { mockTrackMarketingEvent } = vi.hoisted(() => ({
  mockTrackMarketingEvent: vi.fn(),
}));
vi.mock("@/lib/posthog", () => ({
  trackMarketingEvent: mockTrackMarketingEvent,
}));

// Mock next/navigation
const mockUsePathname = vi.fn(() => "/");
vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
}));

// Mock next/link
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
    onClick,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
    onClick?: () => void;
  } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} className={className} onClick={onClick} {...props}>
      {children}
    </a>
  ),
}));

// Mock lucide-react icons
vi.mock("lucide-react", () => ({
  Menu: () => <svg data-testid="icon-menu" />,
  X: () => <svg data-testid="icon-x" />,
  ArrowRight: () => <svg data-testid="icon-arrow-right" />,
  ChevronDown: () => <svg data-testid="icon-chevron-down" />,
  Sun: () => <svg data-testid="icon-sun" />,
  Moon: () => <svg data-testid="icon-moon" />,
  Monitor: () => <svg data-testid="icon-monitor" />,
}));

// Mock Logo component
vi.mock("@/components/Logo", () => ({
  Logo: () => <div data-testid="logo">Logo</div>,
}));

// Mock useActiveLaunchPhase to avoid fetch in tests
vi.mock("@/lib/launch-phase", () => ({
  useActiveLaunchPhase: () => ({
    code: "80OFF",
    label: "80% off the first year",
    discount_percent: 50,
    times_redeemed: 10,
    max_redemptions: 300,
    phase_index: 1,
    all_exhausted: false,
  }),
}));

describe("MarketingNav", () => {
  beforeEach(() => {
    mockUsePathname.mockReturnValue("/");
    mockTrackMarketingEvent.mockClear();
  });

  describe("desktop nav links", () => {
    it("renders only the primary marketing nav links at the top level", () => {
      render(<MarketingNav />);
      expect(screen.getAllByRole("link", { name: "Product" })).toHaveLength(1);
      const pricingLinks = screen.getAllByRole("link", { name: "Pricing" });
      expect(pricingLinks).toHaveLength(1);
      expect(
        pricingLinks.every((link) => link.getAttribute("href") === "/pricing"),
      ).toBe(true);
      expect(screen.getAllByRole("link", { name: "Resources" }).length).toBe(1);
      expect(screen.getAllByRole("link", { name: "About" }).length).toBe(1);
    });

    it("keeps product detail links inside the Product menu", () => {
      const { container } = render(<MarketingNav />);
      expect(
        container.querySelectorAll('a[href="/product/features"]'),
      ).toHaveLength(1);
      expect(container.querySelectorAll('a[href="/solutions"]')).toHaveLength(
        1,
      );
      expect(
        container.querySelectorAll('a[href="/integrations"]'),
      ).toHaveLength(1);
      expect(container.querySelectorAll('a[href="/vs"]')).toHaveLength(1);
    });

    it("opens and closes the Product dropdown with disclosure state", async () => {
      const user = userEvent.setup();
      render(<MarketingNav />);
      const productLink = screen.getByRole("link", { name: "Product" });
      const productMenu = document.getElementById("desktop-product-menu");

      // Disclosure pattern, not an ARIA menu: the panel holds plain links with
      // no menuitem roles or roving focus, so aria-haspopup (which promises menu
      // semantics) must NOT be set. aria-expanded carries the state cue.
      expect(productLink).not.toHaveAttribute("aria-haspopup");
      expect(productLink).toHaveAttribute("aria-expanded", "false");
      expect(productMenu).toHaveClass("invisible", "opacity-0");

      await user.hover(productLink);
      expect(productLink).toHaveAttribute("aria-expanded", "true");
      expect(productMenu).toHaveClass("visible", "opacity-100");

      act(() => {
        productLink.focus();
      });
      await user.keyboard("{Escape}");
      expect(productLink).toHaveAttribute("aria-expanded", "false");
      expect(productMenu).toHaveClass("invisible", "opacity-0");
      expect(productLink).toHaveFocus();
    });

    it("opens the Resources dropdown with disclosure state", async () => {
      const user = userEvent.setup();
      render(<MarketingNav />);
      const resourcesLink = screen.getByRole("link", { name: "Resources" });
      const resourcesMenu = document.getElementById("desktop-resources-menu");

      expect(resourcesLink).not.toHaveAttribute("aria-haspopup");
      expect(resourcesLink).toHaveAttribute("aria-expanded", "false");
      expect(resourcesMenu).toHaveClass("invisible", "opacity-0");

      await user.hover(resourcesLink);
      expect(resourcesLink).toHaveAttribute("aria-expanded", "true");
      expect(resourcesMenu).toHaveClass("visible", "opacity-100");
    });

    it("does NOT render For Tenants link in nav", () => {
      render(<MarketingNav />);
      expect(
        screen.queryByRole("link", { name: /for tenants/i }),
      ).not.toBeInTheDocument();
    });

    it("does NOT render standalone Help or Tools top-level nav links", () => {
      render(<MarketingNav />);
      // "Help" label: the megamenu entry is "Help center" so exact "Help" link count is 0
      expect(screen.queryAllByRole("link", { name: "Help" }).length).toBe(0);
      // "Tools" label: the megamenu entry is "All tools" so exact "Tools" link count is 0
      expect(screen.queryAllByRole("link", { name: "Tools" }).length).toBe(0);
    });

    it("does NOT render How It Works link in nav", () => {
      render(<MarketingNav />);
      expect(
        screen.queryByRole("link", { name: "How It Works" }),
      ).not.toBeInTheDocument();
    });

    it("does NOT render ROI Calculator link in nav", () => {
      render(<MarketingNav />);
      expect(
        screen.queryByRole("link", { name: "ROI Calculator" }),
      ).not.toBeInTheDocument();
    });

    it("renders About link in nav", () => {
      render(<MarketingNav />);
      expect(
        screen.getAllByRole("link", { name: "About" }).length,
      ).toBeGreaterThanOrEqual(1);
    });

    it("does NOT render Contact link in nav", () => {
      render(<MarketingNav />);
      expect(
        screen.queryByRole("link", { name: "Contact" }),
      ).not.toBeInTheDocument();
    });

    it("renders Sign in link pointing to APP_URL/auth/login", () => {
      render(<MarketingNav />);
      const loginLink = screen.getAllByRole("link", { name: "Sign in" })[0];
      expect(loginLink).toBeInTheDocument();
      expect(loginLink).toHaveAttribute(
        "href",
        expect.stringContaining("/auth/login"),
      );
    });

    it("shows the limited time offer in the banner without scarcity count", () => {
      render(<MarketingNav />);
      const bannerLink = screen.getByRole("link", {
        name: /80OFF/i,
      });
      expect(bannerLink).toBeInTheDocument();
      expect(bannerLink).toHaveAttribute(
        "href",
        expect.stringContaining("/pricing"),
      );
      expect(bannerLink.textContent).not.toMatch(/redemptions only/i);
    });

    it("does not render theme controls in the header", () => {
      render(<MarketingNav />);
      expect(
        screen.queryByRole("button", { name: "Toggle theme" }),
      ).not.toBeInTheDocument();
    });

    it("renders Start Free Trial CTA pointing to APP_URL/auth/register", () => {
      render(<MarketingNav />);
      const ctaLink = screen.getAllByRole("link", {
        name: /start free trial/i,
      })[0];
      expect(ctaLink).toBeInTheDocument();
      expect(ctaLink).toHaveAttribute(
        "href",
        expect.stringContaining("/auth/register"),
      );
    });

    it("fires cta_clicked event when desktop CTA is clicked", async () => {
      const user = userEvent.setup();
      render(<MarketingNav />);
      const ctaLink = screen.getAllByRole("link", {
        name: /start free trial/i,
      })[0];
      await user.click(ctaLink);
      expect(mockTrackMarketingEvent).toHaveBeenCalledWith("cta_clicked", {
        button_text: "Start free trial",
        location: "nav_desktop",
      });
    });
  });

  describe("active link styling", () => {
    it("applies active styling to Pricing when pathname is /pricing", () => {
      mockUsePathname.mockReturnValue("/pricing");
      render(<MarketingNav />);
      const pricingLink = screen.getAllByRole("link", { name: "Pricing" })[0];
      expect(pricingLink).toHaveClass("border-b-2", "border-primary");
    });

    it("does not apply active styling to Features when pathname is /pricing", () => {
      mockUsePathname.mockReturnValue("/pricing");
      render(<MarketingNav />);
      const productLink = screen.getAllByRole("link", { name: "Product" })[0];
      expect(productLink).not.toHaveClass("border-b-2");
    });

    it("applies active styling to Product for product detail paths", () => {
      mockUsePathname.mockReturnValue("/solutions");
      render(<MarketingNav />);
      const productLink = screen.getAllByRole("link", { name: "Product" })[0];
      expect(productLink).toHaveClass("border-b-2", "border-primary");
    });

    it("applies active styling to Resources when pathname is /resources", () => {
      mockUsePathname.mockReturnValue("/resources");
      render(<MarketingNav />);
      const resourcesLink = screen.getAllByRole("link", {
        name: "Resources",
      })[0];
      expect(resourcesLink).toHaveClass("border-b-2", "border-primary");
    });
  });

  describe("mobile menu", () => {
    it("hamburger button is visible by default", () => {
      render(<MarketingNav />);
      expect(
        screen.getByRole("button", { name: "Open menu" }),
      ).toBeInTheDocument();
    });

    it("mobile menu is hidden by default", () => {
      render(<MarketingNav />);
      const hamburger = screen.getByRole("button", { name: "Open menu" });
      expect(hamburger).toHaveAttribute("aria-expanded", "false");
      expect(screen.queryByRole("button", { name: "Product menu" })).toBeNull();
      expect(
        screen.queryByRole("button", { name: "Resource menu" }),
      ).toBeNull();
    });

    it("clicking hamburger opens mobile menu", async () => {
      const user = userEvent.setup();
      render(<MarketingNav />);
      const hamburger = screen.getByRole("button", { name: "Open menu" });
      await user.click(hamburger);
      expect(hamburger).toHaveAttribute("aria-expanded", "true");
      expect(
        screen.getByRole("button", { name: "Close menu" }),
      ).toBeInTheDocument();
    });

    it("mobile menu shows the primary marketing nav links when open", async () => {
      const user = userEvent.setup();
      render(<MarketingNav />);
      await user.click(screen.getByRole("button", { name: "Open menu" }));
      // After opening, there should be multiple links with these labels (desktop + mobile)
      const productLinks = screen.getAllByRole("link", { name: "Product" });
      const resourcesLinks = screen.getAllByRole("link", { name: "Resources" });
      const pricingLinks = screen.getAllByRole("link", { name: "Pricing" });
      const aboutLinks = screen.getAllByRole("link", { name: "About" });
      expect(productLinks.length).toBeGreaterThanOrEqual(1);
      expect(resourcesLinks.length).toBeGreaterThanOrEqual(1);
      expect(pricingLinks.length).toBeGreaterThanOrEqual(1);
      expect(aboutLinks.length).toBeGreaterThanOrEqual(1);
      expect(screen.queryByRole("button", { name: "Product menu" })).toBeNull();
      expect(
        screen.queryByRole("button", { name: "Resource menu" }),
      ).toBeNull();
      expect(screen.queryByRole("link", { name: "Features" })).toBeNull();
      expect(
        screen.queryByRole("link", { name: "CAM Guides" }),
      ).not.toBeInTheDocument();
    });

    it("mobile menu keeps product detail links out of the header", async () => {
      const user = userEvent.setup();
      render(<MarketingNav />);
      await user.click(screen.getByRole("button", { name: "Open menu" }));
      expect(
        screen.queryByRole("link", { name: "Features" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("link", { name: "Solutions" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("link", { name: "Supported ERP exports" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("link", { name: "Compare CapVeri" }),
      ).not.toBeInTheDocument();
    });

    it("mobile menu keeps resource hub links out of the header", async () => {
      const user = userEvent.setup();
      render(<MarketingNav />);
      await user.click(screen.getByRole("button", { name: "Open menu" }));
      expect(
        screen.queryByRole("link", { name: "CAM Guides" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("link", { name: "Tools & Calculators" }),
      ).not.toBeInTheDocument();
    });

    it("mobile menu does NOT show removed links when open", async () => {
      const user = userEvent.setup();
      render(<MarketingNav />);
      await user.click(screen.getByRole("button", { name: "Open menu" }));
      expect(
        screen.queryByRole("link", { name: "How It Works" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("link", { name: "ROI Calculator" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("link", { name: "How It Works" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("link", { name: "Contact" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("link", { name: /for tenants/i }),
      ).not.toBeInTheDocument();
    });

    it("applies active styling to Pricing in mobile menu when pathname is /pricing", async () => {
      mockUsePathname.mockReturnValue("/pricing");
      const user = userEvent.setup();
      render(<MarketingNav />);
      await user.click(screen.getByRole("button", { name: "Open menu" }));
      // In mobile menu, active link gets bg-muted class
      const allPricingLinks = screen.getAllByRole("link", { name: "Pricing" });
      const mobilePricingLink = allPricingLinks[allPricingLinks.length - 1];
      expect(mobilePricingLink).toHaveClass("bg-muted");
    });

    it("clicking a mobile link closes the mobile menu", async () => {
      const user = userEvent.setup();
      render(<MarketingNav />);
      await user.click(screen.getByRole("button", { name: "Open menu" }));
      expect(
        screen.getByRole("button", { name: "Close menu" }),
      ).toBeInTheDocument();
      // Click the Product link in the mobile menu area.
      const allProductLinks = screen.getAllByRole("link", {
        name: "Product",
      });
      // The mobile link has an onClick handler to close the menu
      await user.click(allProductLinks[allProductLinks.length - 1]);
      expect(screen.getByRole("button", { name: "Open menu" })).toHaveAttribute(
        "aria-expanded",
        "false",
      );
    });
  });
});
