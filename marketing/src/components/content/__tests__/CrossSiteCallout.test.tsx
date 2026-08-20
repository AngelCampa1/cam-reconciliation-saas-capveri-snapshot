import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  CrossSiteCallout,
  CrossSiteCalloutCamAudit,
  TenantAudienceBanner,
} from "@/components/content/CrossSiteCallout";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    target,
    rel,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    target?: string;
    rel?: string;
    className?: string;
  }) => (
    <a href={href} target={target} rel={rel} className={className}>
      {children}
    </a>
  ),
}));

describe("CrossSiteCallout", () => {
  it("renders the lextract heading", () => {
    render(<CrossSiteCallout />);
    expect(
      screen.getByText("Need lease data before you reconcile?"),
    ).toBeInTheDocument();
  });

  it("renders the lextract body text", () => {
    render(<CrossSiteCallout />);
    expect(screen.getAllByText(/lextract\.io/).length).toBeGreaterThan(0);
  });

  it("renders the lextract link with correct href", () => {
    render(<CrossSiteCallout />);
    const link = screen.getByRole("link", { name: /go to lextract\.io/i });
    expect(link).toHaveAttribute("href", "https://www.lextract.io");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });
});

describe("CrossSiteCalloutCamAudit", () => {
  it("renders the camaudit heading", () => {
    render(<CrossSiteCalloutCamAudit />);
    expect(
      screen.getByText(/Need to verify your landlord's CAM charges\?/),
    ).toBeInTheDocument();
  });

  it("renders the camaudit body text", () => {
    render(<CrossSiteCalloutCamAudit />);
    expect(screen.getAllByText(/CAMAudit\.io/).length).toBeGreaterThan(0);
  });

  it("renders the camaudit link with correct href", () => {
    render(<CrossSiteCalloutCamAudit />);
    const link = screen.getByRole("link", { name: /start forensic review/i });
    expect(link).toHaveAttribute("href", "https://www.camaudit.io");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });
});

describe("TenantAudienceBanner", () => {
  it("renders the tenant orientation heading", () => {
    render(<TenantAudienceBanner />);
    expect(
      screen.getByText(/Are you a commercial tenant\?/),
    ).toBeInTheDocument();
  });

  it("renders the forensic audit link with correct href", () => {
    render(<TenantAudienceBanner />);
    const link = screen.getByRole("link", {
      name: /start a forensic review/i,
    });
    expect(link).toHaveAttribute("href", "https://www.camaudit.io");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });
});
