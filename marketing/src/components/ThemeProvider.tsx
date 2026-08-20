"use client";

import type { ReactNode } from "react";
import { ThemeProvider as LightThemeProvider } from "light-theme-only";

export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <LightThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      disableTransitionOnChange
    >
      {children}
    </LightThemeProvider>
  );
}
