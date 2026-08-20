import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Logo } from "@/components/Logo";

describe("Logo", () => {
  it("renders an img with correct src and alt", () => {
    render(<Logo />);
    const img = screen.getByRole("img", { name: "CapVeri" });
    expect(img).toHaveAttribute("src", "/icons/icon.svg");
  });

  it("defaults to md size (h-10 w-10)", () => {
    render(<Logo />);
    expect(screen.getByRole("img")).toHaveClass("h-10", "w-10");
  });

  it.each([
    ["xs", "h-6", "w-6"],
    ["sm", "h-8", "w-8"],
    ["md", "h-10", "w-10"],
    ["lg", "h-12", "w-12"],
    ["xl", "h-16", "w-16"],
  ] as const)("size=%s applies class %s %s", (size, h, w) => {
    render(<Logo size={size} />);
    expect(screen.getByRole("img")).toHaveClass(h, w);
  });

  it("shows text span by default", () => {
    render(<Logo />);
    expect(screen.getByText("CapVeri")).toBeInTheDocument();
  });

  it("hides text when showText=false", () => {
    render(<Logo showText={false} />);
    expect(screen.queryByText("CapVeri")).not.toBeInTheDocument();
  });

  it("passes additional className to wrapper", () => {
    const { container } = render(<Logo className="my-custom-class" />);
    expect(container.firstChild).toHaveClass("my-custom-class");
  });
});
