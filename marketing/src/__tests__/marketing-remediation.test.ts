import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import nextConfig from "../../next.config";

const { redirectMock } = vi.hoisted(() => ({
  redirectMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

describe("marketing remediation", () => {
  it("allows the production API origin in the CSP connect-src", async () => {
    const headers = await nextConfig.headers?.();
    const csp = headers
      ?.flatMap((entry) => entry.headers)
      .find((header) => header.key === "Content-Security-Policy")?.value;

    expect(csp).toContain("connect-src");
    expect(csp).toContain("https://api.capveri.com");
  });

  it("allows Cloudflare Turnstile to load its script and challenge iframe", async () => {
    const headers = await nextConfig.headers?.();
    const csp = headers
      ?.flatMap((entry) => entry.headers)
      .find((header) => header.key === "Content-Security-Policy")?.value;

    // Turnstile injects a script from challenges.cloudflare.com and renders
    // the challenge inside an iframe; both script-src and frame-src must allow
    // the host or the contact + lead-capture forms break in production.
    const directives = (csp ?? "")
      .split(";")
      .map((directive) => directive.trim());
    const scriptSrc = directives.find((d) => d.startsWith("script-src"));
    const frameSrc = directives.find((d) => d.startsWith("frame-src"));

    expect(scriptSrc).toContain("https://challenges.cloudflare.com");
    expect(frameSrc).toContain("https://challenges.cloudflare.com");
  });

  it("allows the pinned AI-SDR worker host but not the old feedback widget host in the CSP", async () => {
    const headers = await nextConfig.headers?.();
    const csp = headers
      ?.flatMap((entry) => entry.headers)
      .find((header) => header.key === "Content-Security-Policy")?.value;

    const directives = (csp ?? "")
      .split(";")
      .map((directive) => directive.trim());
    const scriptSrc = directives.find((d) => d.startsWith("script-src"));
    const connectSrc = directives.find((d) => d.startsWith("connect-src"));

    // The AI-SDR sales widget loads a versioned global script from the worker and
    // calls /v1/* on it, so both directives must allow the worker origin. The
    // script is locked to a Subresource Integrity hash (asserted below), so the
    // browser refuses any build whose bytes differ from the pinned client.
    expect(scriptSrc).toContain(
      "https://ventora-ai-sdr-worker.REPLACE_WITH_WORKERS_DEV_SUBDOMAIN.workers.dev",
    );
    expect(connectSrc).toContain(
      "https://ventora-ai-sdr-worker.REPLACE_WITH_WORKERS_DEV_SUBDOMAIN.workers.dev",
    );
    // The earlier mutable feedback widget host stays banned.
    expect(csp).not.toContain("https://widgets.ventoralabs.com");
  });

  it("pins the AI-SDR client to a Subresource Integrity hash", () => {
    const widgetSource = readFileSync(
      resolve(
        process.cwd(),
        "src/components/ai-sdr/AiSdrSalesWidget.tsx",
      ),
      "utf8",
    );

    // Allowing the worker host in the CSP is only safe because the loader pins the
    // client bytes. If this guard is ever removed, a swapped worker build could run.
    expect(widgetSource).toMatch(/script\.integrity = CLIENT_INTEGRITY/);
    expect(widgetSource).toContain('script.crossOrigin = "anonymous"');
    expect(widgetSource).toMatch(/const CLIENT_INTEGRITY =\s*\n?\s*"sha384-/);
  });

  it("mounts the AI-SDR widget as a pinned component, not an inline feedback widget", () => {
    const layoutSource = readFileSync(
      resolve(process.cwd(), "src/app/layout.tsx"),
      "utf8",
    );

    // The widget mounts through the AiSdrSalesWidget component (which pins SRI),
    // never as a raw worker-URL script tag or the old feedback-button embed.
    expect(layoutSource).toContain("AiSdrSalesWidget");
    expect(layoutSource).not.toContain("widgets.ventoralabs.com/w/v1.js");
    expect(layoutSource).not.toContain(
      "ventora-ai-sdr-worker.REPLACE_WITH_WORKERS_DEV_SUBDOMAIN.workers.dev",
    );
    expect(layoutSource).not.toContain('data-product="capveri"');
    expect(layoutSource).not.toContain('data-widget="feedback-button"');
  });

  it("does not redirect dynamic resource pages that have real marketing routes", async () => {
    const redirects = await nextConfig.redirects?.();
    const redirectSources = new Set(
      (redirects ?? []).map((redirect) => redirect.source),
    );

    expect(redirectSources.has("/resources/states/:state/cam-compliance")).toBe(
      false,
    );
    expect(redirectSources.has("/resources/markets/:metro/cam-guide")).toBe(
      false,
    );
    expect(
      redirectSources.has("/resources/property-types/:type/cam-guide"),
    ).toBe(false);
    expect(redirectSources.has("/resources/roles/:role/cam-guide")).toBe(false);
    expect(redirectSources.has("/resources/workflows/:workflow")).toBe(false);
    expect(redirectSources.has("/resources/lease-clauses/:clause")).toBe(false);
    expect(redirectSources.has("/resources/expenses/:category")).toBe(false);
    expect(redirectSources.has("/resources/boma/:topic")).toBe(false);
  });

  it("keeps HCAD calculator calls on the centralized marketing API helper", () => {
    const clientSource = readFileSync(
      resolve(
        process.cwd(),
        "src/app/tools/hcad-tax-normalizer/HcadTaxNormalizerClient.tsx",
      ),
      "utf8",
    );

    expect(clientSource).toContain('from "@/lib/api"');
    expect(clientSource).toContain(
      'marketingApiUrl("/api/v1/tools/hcad-tax-normalizer/calculate")',
    );
    expect(clientSource).not.toContain("process.env.NEXT_PUBLIC_API_URL");
    expect(clientSource).not.toContain("API_BASE_URL");
    expect(clientSource).not.toContain(
      'fetch(\n        "/api/v1/tools/hcad-tax-normalizer/calculate"',
    );
  });

  it("centralizes client API base URL construction", () => {
    const checkedFiles = [
      "src/components/ContactForm.tsx",
      "src/components/lead-capture/LeadCaptureForm.tsx",
      "src/components/lead-capture/CalculatorUnlockGate.tsx",
      "src/app/tools/boma-2024-calculator/Boma2024CalculatorClient.tsx",
      "src/app/tools/fixed-cam-vs-traditional/FixedCamClient.tsx",
      "src/app/tools/hcad-tax-normalizer/HcadTaxNormalizerClient.tsx",
      "src/app/unsubscribe/UnsubscribeClient.tsx",
      "src/lib/launch-phase.ts",
    ];

    for (const relativePath of checkedFiles) {
      const source = readFileSync(resolve(process.cwd(), relativePath), "utf8");
      expect(source).toContain('from "@/lib/api"');
      expect(source).not.toContain("process.env.NEXT_PUBLIC_API_URL");
      expect(source).not.toMatch(/API_BASE(?:_URL)?\s*=/);
    }
  });

  // Walks the repository tree, so it runs well past vitest's 15s default
  // whenever the full suite saturates the machine. Given an explicit budget:
  // it passes in ~8s isolated and the work is genuinely filesystem-bound.
  it("keeps source marketing data free of mojibake sequences", () => {
    const roots = [
      process.cwd(),
      resolve(process.cwd(), "../knowledge/source"),
    ];
    const mojibakeLeadCodePoints = new Set([0x00e2, 0x00c3, 0x00c2]);

    function collectFiles(path: string): string[] {
      if (!existsSync(path)) return [];
      const stat = statSync(path);
      if (stat.isFile()) return [path];
      return readdirSync(path, { withFileTypes: true }).flatMap((entry) =>
        ["node_modules", ".next"].includes(entry.name)
          ? []
          : collectFiles(resolve(path, entry.name)),
      );
    }

    const offenders = roots
      .flatMap(collectFiles)
      .filter((path) => /\.(json|ts|tsx|mdx|md|mjs|js)$/.test(path))
      .filter((path) => !path.includes("generated"))
      .flatMap((path) => {
        const text = readFileSync(path, "utf8");
        const line = text
          .split(/\r?\n/)
          .find((line) =>
            [...line].some((char) =>
              mojibakeLeadCodePoints.has(char.codePointAt(0) ?? 0),
            ),
          );
        return line ? [`${path}: ${line}`] : [];
      });

    expect(offenders).toEqual([]);
  }, 60_000);

  it("keeps footer links concise and on the marketing domain", () => {
    const footerSource = readFileSync(
      resolve(process.cwd(), "src/components/MarketingFooter.tsx"),
      "utf8",
    );

    expect(footerSource).toContain('href: "/resources"');
    expect(footerSource).not.toContain('href: "/resources/gl-coding-guide"');
    expect(footerSource).not.toContain(
      'href: "/resources/tenant-cam-audit-landlord-side"',
    );
    expect(footerSource).not.toContain('href: "/tools/noi-impact-calculator"');
    expect(footerSource).not.toContain("app.capveri.com`}/resources");
    expect(footerSource).not.toContain("camaudit.io");
    expect(footerSource).not.toContain("lextract.io");
  });

  it("normalizes checkout success session IDs before redirecting", async () => {
    const { default: CheckoutSuccessPage } =
      await import("../app/checkout/success/page");

    await CheckoutSuccessPage({
      searchParams: Promise.resolve({
        session_id: ["cs_test_a&b", "ignored"],
      }),
    });

    expect(redirectMock).toHaveBeenCalledWith(
      "https://app.capveri.com/checkout/success?session_id=cs_test_a%26b",
    );
  });
});
