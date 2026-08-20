import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    testTimeout: 15000,
    environment: "jsdom",
    setupFiles: ["./src/__tests__/setup.ts", "./src/test/setup.ts"],
    exclude: ["**/node_modules/**", "**/e2e/**", "**/*.spec.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json"],
      reportsDirectory: path.resolve(__dirname, "coverage"),
      include: [
        // Already covered
        "src/components/landing/PersonaToggle.tsx",
        "src/components/landing/LandingPageClient.tsx",
        "src/components/landing/HeroSection.tsx",
        "src/components/landing/ValuePropositionSection.tsx",
        "src/components/landing/CTASection.tsx",
        "src/components/landing/FeaturesGrid.tsx",
        "src/components/landing/FAQSection.tsx",
        "src/components/landing/SocialProofStrip.tsx",
        // New additions
        "src/lib/structured-data.ts",
        "src/components/landing/ROICalculator.tsx",
        "src/components/landing/HowItWorksSection.tsx",
        // index.ts is a barrel file (re-exports only) - v8 can't cover re-export statements
        // "src/components/landing/index.ts",
        "src/hooks/useScrollReveal.ts",
        "src/lib/auditLink.ts",
        "src/components/ContactForm.tsx",
        "src/components/MarketingNav.tsx",
        "src/components/MarketingFooter.tsx",
        "src/components/Logo.tsx",
        "src/components/JsonLd.tsx",
        "src/components/VideoEmbed.tsx",
        "src/components/content/ContentPageLayout.tsx",
        "src/components/content/ToolPageLayout.tsx",
        "src/components/lead-capture/LeadCaptureForm.tsx",
        "src/components/lead-capture/CalculatorUnlockGate.tsx",
        "src/components/ThemeProvider.tsx",
        "src/components/ThemeToggle.tsx",
        "src/components/landing/PricingTeaser.tsx",
        "src/data/faq-data.tsx",
        "src/app/help/HelpCenterClient.tsx",
        "src/lib/feature-catalog.ts",
      ],
      exclude: [
        "node_modules/",
        "**/*.test.{ts,tsx}",
        "**/*.spec.{ts,tsx}",
        "src/__tests__/**",
        "src/test/**",
        "src/**/*.d.ts",
        "src/app/**/page.tsx",
        "src/app/**/layout.tsx",
      ],
      thresholds: {
        lines: 95,
        branches: 95,
        functions: 95,
        statements: 95,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
