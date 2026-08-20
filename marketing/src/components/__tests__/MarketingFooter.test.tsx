import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MarketingFooter } from "@/components/MarketingFooter";

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

describe("MarketingFooter", () => {
  describe("variant=full (default)", () => {
    it("renders copyright with current year", () => {
      render(<MarketingFooter />);
      const year = new Date().getFullYear().toString();
      expect(screen.getAllByText(new RegExp(year)).length).toBeGreaterThan(0);
    });

    it("renders the uncluttered footer section headings", () => {
      render(<MarketingFooter />);
      // Use heading role to distinguish section headings from nav links
      expect(
        screen.getByRole("heading", { name: "Product" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("heading", { name: "Resources" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("heading", { name: "Company" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("heading", { name: "Legal" }),
      ).toBeInTheDocument();
    });

    it("renders product links", () => {
      render(<MarketingFooter />);
      // Content parity: each link is rendered in BOTH the mobile accordion
      // (md:hidden) and the desktop grid (hidden md:grid), so queries match
      // multiple elements. Assert at least one link has the expected href.
      const expectLink = (name: string, href: string) => {
        const matches = screen.getAllByRole("link", { name });
        expect(matches.length).toBeGreaterThan(0);
        expect(matches.some((el) => el.getAttribute("href") === href)).toBe(
          true,
        );
      };
      expectLink("Features", "/product/features");
      expectLink("Product Tour", "/product-tour");
      expect(
        screen.getAllByRole("link", { name: "Pricing" }).length,
      ).toBeGreaterThan(0);
      expectLink("Compare CapVeri", "/vs");
    });

    it("renders legal links", () => {
      render(<MarketingFooter />);
      expect(
        screen.getAllByRole("link", { name: "Privacy Policy" }).length,
      ).toBeGreaterThan(0);
      expect(
        screen.getAllByRole("link", { name: "Terms of Service" }).length,
      ).toBeGreaterThan(0);
    });

    it("folds tools and compare into concise main footer groups", () => {
      render(<MarketingFooter />);
      expect(screen.queryByRole("heading", { name: "Tools" })).toBeNull();
      expect(screen.queryByRole("heading", { name: "Compare" })).toBeNull();
      expect(
        screen
          .getAllByRole("link", { name: "Tools" })
          .some((el) => el.getAttribute("href") === "/tools"),
      ).toBe(true);
      expect(
        screen.queryByRole("link", { name: "NOI Impact Calculator" }),
      ).not.toBeInTheDocument();
      expect(
        screen
          .getAllByRole("link", { name: "Compare CapVeri" })
          .some((el) => el.getAttribute("href") === "/vs"),
      ).toBe(true);
    });

    it("renders sources link in company section", () => {
      render(<MarketingFooter />);
      const matches = screen.getAllByRole("link", {
        name: "Sources & Research",
      });
      expect(matches.length).toBeGreaterThan(0);
      expect(matches.some((el) => el.getAttribute("href") === "/sources")).toBe(
        true,
      );
    });

    it("renders made-with-care tagline", () => {
      render(<MarketingFooter />);
      expect(
        screen.getByText(/made with care for cre professionals/i),
      ).toBeInTheDocument();
    });
  });

  describe("variant=minimal", () => {
    it("renders copyright with current year", () => {
      render(<MarketingFooter variant="minimal" />);
      const year = new Date().getFullYear().toString();
      expect(screen.getByText(new RegExp(year))).toBeInTheDocument();
    });

    it("renders legal links", () => {
      render(<MarketingFooter variant="minimal" />);
      expect(
        screen.getByRole("link", { name: "Privacy Policy" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: "Terms of Service" }),
      ).toBeInTheDocument();
    });

    it("does not render section headings like Product or Tools", () => {
      render(<MarketingFooter variant="minimal" />);
      expect(screen.queryByText("Product")).not.toBeInTheDocument();
      expect(screen.queryByText("Tools")).not.toBeInTheDocument();
      expect(screen.queryByText("Compare")).not.toBeInTheDocument();
    });

    it("does not render made-with-care tagline", () => {
      render(<MarketingFooter variant="minimal" />);
      expect(screen.queryByText(/made with care/i)).not.toBeInTheDocument();
    });
  });
});
