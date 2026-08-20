import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ThemeProvider } from "../ThemeProvider";

// Mock light-theme-only
vi.mock("light-theme-only", () => ({
  ThemeProvider: ({
    children,
    attribute,
    defaultTheme,
    enableSystem,
    disableTransitionOnChange,
  }: {
    children: ReactNode;
    attribute?: string;
    defaultTheme?: string;
    enableSystem?: boolean;
    disableTransitionOnChange?: boolean;
  }) => (
    <div
      data-testid="light-theme-only-provider"
      data-attribute={attribute}
      data-default-theme={defaultTheme}
      data-enable-system={String(enableSystem)}
      data-disable-transition={String(disableTransitionOnChange)}
    >
      {children}
    </div>
  ),
}));

describe("ThemeProvider", () => {
  it("renders children without crashing", () => {
    render(
      <ThemeProvider>
        <div data-testid="child">hello</div>
      </ThemeProvider>,
    );
    expect(screen.getByTestId("child")).toBeInTheDocument();
  });

  it("passes correct props to light-theme-only ThemeProvider", () => {
    render(
      <ThemeProvider>
        <span />
      </ThemeProvider>,
    );
    const provider = screen.getByTestId("light-theme-only-provider");
    expect(provider).toHaveAttribute("data-attribute", "class");
    // This package is light-only with no dark CSS variables, so the provider
    // pins light and disables system following. A system-dark visitor would
    // otherwise get colorScheme: dark applied to a white-only page.
    expect(provider).toHaveAttribute("data-default-theme", "light");
    expect(provider).toHaveAttribute("data-enable-system", "false");
    expect(provider).toHaveAttribute("data-disable-transition", "true");
  });
});
