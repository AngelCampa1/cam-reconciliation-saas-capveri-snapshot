import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { BlogPostLayout } from "../BlogPostLayout";

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

const defaultProps = {
  pageName: "Test Blog Post",
  author: "Angel",
  authorRole: "Founder, CapVeri",
  dateModified: "2026-02-27",
  children: <p>Post content</p>,
};

describe("BlogPostLayout", () => {
  it("renders the post title as h1", () => {
    render(<BlogPostLayout {...defaultProps} />);
    expect(
      screen.getByRole("heading", { level: 1, name: /test blog post/i }),
    ).toBeInTheDocument();
  });

  it("renders the author name", () => {
    render(<BlogPostLayout {...defaultProps} />);
    expect(screen.getByText("Angel")).toBeInTheDocument();
  });

  it("renders the author role when provided", () => {
    render(<BlogPostLayout {...defaultProps} />);
    expect(screen.getByText("Founder, CapVeri")).toBeInTheDocument();
  });

  it("renders a time element with dateModified attribute", () => {
    render(<BlogPostLayout {...defaultProps} />);
    const timeEl = screen.getByRole("time");
    expect(timeEl).toHaveAttribute("dateTime", "2026-02-27");
    expect(timeEl.textContent).toMatch(/updated/i);
  });

  it("renders without authorRole (optional prop)", () => {
    const { author, ...propsWithoutRole } = defaultProps;
    render(<BlogPostLayout {...propsWithoutRole} author={author} />);
    expect(screen.getByText("Angel")).toBeInTheDocument();
  });
});
