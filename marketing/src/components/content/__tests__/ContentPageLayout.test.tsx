import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ContentPageLayout } from "@/components/content/ContentPageLayout";

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

describe("ContentPageLayout", () => {
  it("renders children", () => {
    render(
      <ContentPageLayout pageName="Test Page">
        <p>Hello World</p>
      </ContentPageLayout>,
    );
    expect(screen.getByText("Hello World")).toBeInTheDocument();
  });

  it("renders breadcrumb with pageName", () => {
    render(
      <ContentPageLayout pageName="GL Coding Guide">
        <div />
      </ContentPageLayout>,
    );
    expect(screen.getByText("GL Coding Guide")).toBeInTheDocument();
    expect(screen.getByText("Resources")).toBeInTheDocument();
    expect(screen.getByText("Home")).toBeInTheDocument();
  });

  it("renders back-to-resources link", () => {
    render(
      <ContentPageLayout pageName="Test">
        <div />
      </ContentPageLayout>,
    );
    expect(screen.getByText(/back to resources/i)).toBeInTheDocument();
  });

  it("renders no script tags when structuredData is undefined", () => {
    const { container } = render(
      <ContentPageLayout pageName="Test">
        <div />
      </ContentPageLayout>,
    );
    expect(container.querySelectorAll("script")).toHaveLength(0);
  });

  it("renders one script tag for a single structuredData object", () => {
    const schema = { "@type": "WebPage", name: "Test" };
    const { container } = render(
      <ContentPageLayout pageName="Test" structuredData={schema}>
        <div />
      </ContentPageLayout>,
    );
    expect(container.querySelectorAll("script")).toHaveLength(1);
  });

  it("renders multiple script tags for a structuredData array", () => {
    const schemas = [
      { "@type": "WebPage", name: "A" },
      { "@type": "BreadcrumbList", name: "B" },
    ];
    const { container } = render(
      <ContentPageLayout pageName="Test" structuredData={schemas}>
        <div />
      </ContentPageLayout>,
    );
    expect(container.querySelectorAll("script")).toHaveLength(2);
  });

  it("nav has aria-label Breadcrumb", () => {
    render(
      <ContentPageLayout pageName="Test">
        <div />
      </ContentPageLayout>,
    );
    expect(
      screen.getByRole("navigation", { name: /breadcrumb/i }),
    ).toBeInTheDocument();
  });

  it("uses semantic theme classes for shell and breadcrumb", () => {
    const { container } = render(
      <ContentPageLayout pageName="Theme Test">
        <div>Body</div>
      </ContentPageLayout>,
    );

    expect(container.firstElementChild).toHaveClass("content-page-shell");
    expect(container.querySelector(".content-breadcrumb-bar")).not.toBeNull();
    expect(container.querySelector(".content-back-link")).not.toBeNull();
    expect(container.querySelector(".content-breadcrumb-text")).not.toBeNull();
  });
});
