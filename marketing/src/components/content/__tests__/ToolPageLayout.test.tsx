import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ToolPageLayout } from "@/components/content/ToolPageLayout";

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

describe("ToolPageLayout", () => {
  it("renders children", () => {
    render(
      <ToolPageLayout toolName="CAM Calculator">
        <p>Tool content here</p>
      </ToolPageLayout>,
    );
    expect(screen.getByText("Tool content here")).toBeInTheDocument();
  });

  it("renders breadcrumb with toolName", () => {
    render(
      <ToolPageLayout toolName="Gross-Up Calculator">
        <div />
      </ToolPageLayout>,
    );
    expect(screen.getByText("Gross-Up Calculator")).toBeInTheDocument();
    expect(screen.getByText("Tools")).toBeInTheDocument();
    expect(screen.getByText("Home")).toBeInTheDocument();
  });

  it("links Home to / and Tools to /tools", () => {
    render(
      <ToolPageLayout toolName="My Tool">
        <div />
      </ToolPageLayout>,
    );
    const homeLink = screen.getByRole("link", { name: "Home" });
    const toolsLink = screen.getByRole("link", { name: "Tools" });
    expect(homeLink).toHaveAttribute("href", "/");
    expect(toolsLink).toHaveAttribute("href", "/tools");
  });

  it("renders one script tag for a single structuredData object", () => {
    const schema = { "@type": "WebPage", name: "Test" };
    const { container } = render(
      <ToolPageLayout toolName="Test" structuredData={schema}>
        <div />
      </ToolPageLayout>,
    );
    expect(container.querySelectorAll("script")).toHaveLength(1);
  });

  it("renders multiple script tags for a structuredData array", () => {
    const schemas = [
      { "@type": "WebPage", name: "A" },
      { "@type": "BreadcrumbList", name: "B" },
    ];
    const { container } = render(
      <ToolPageLayout toolName="Test" structuredData={schemas}>
        <div />
      </ToolPageLayout>,
    );
    expect(container.querySelectorAll("script")).toHaveLength(2);
  });

  it("renders no script tags when structuredData is undefined", () => {
    const { container } = render(
      <ToolPageLayout toolName="Test">
        <div />
      </ToolPageLayout>,
    );
    expect(container.querySelectorAll("script")).toHaveLength(0);
  });

  it("renders breadcrumb nav with aria-label", () => {
    render(
      <ToolPageLayout toolName="Test">
        <div />
      </ToolPageLayout>,
    );
    expect(
      screen.getByRole("navigation", { name: /breadcrumb/i }),
    ).toBeInTheDocument();
  });

  it("uses semantic theme classes for tool shell and breadcrumb", () => {
    const { container } = render(
      <ToolPageLayout toolName="Theme Tool">
        <div />
      </ToolPageLayout>,
    );
    expect(container.firstElementChild).toHaveClass("tool-page-shell");
    expect(container.querySelector(".content-breadcrumb-text")).not.toBeNull();
  });
});
