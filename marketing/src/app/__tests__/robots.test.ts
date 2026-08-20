import { describe, expect, it } from "vitest";
import robots from "../robots";

describe("robots metadata route", () => {
  it("allows citation-oriented AI crawlers and blocks training-only crawlers", () => {
    const result = robots();
    const rules = Array.isArray(result.rules) ? result.rules : [result.rules];

    expect(result.sitemap).toBe("https://www.capveri.com/sitemap.xml");

    expect(rules).toEqual(
      expect.arrayContaining([
        { userAgent: "*", allow: "/" },
        { userAgent: "GPTBot", allow: "/" },
        { userAgent: "OAI-SearchBot", allow: "/" },
        { userAgent: "ChatGPT-User", allow: "/" },
        { userAgent: "PerplexityBot", allow: "/" },
        { userAgent: "ClaudeBot", allow: "/" },
        { userAgent: "anthropic-ai", allow: "/" },
        { userAgent: "Google-Extended", allow: "/" },
        { userAgent: "CCBot", disallow: "/" },
        { userAgent: "Bytespider", disallow: "/" },
      ]),
    );
  });
});
