import { describe, expect, it } from "vitest";
import { buildContextualLinks } from "../contextual-links";

describe("buildContextualLinks", () => {
  it("routes TOFU glossary-style content toward guides and tools", () => {
    const links = buildContextualLinks({
      currentPath: "/blog/what-is-cam-reconciliation",
      funnelStage: "tofu",
      audience: "landlord",
      tags: ["gross-up", "pro-rata"],
    });

    expect(links.map((link) => link.href)).toContain(
      "/cam-reconciliation-guide",
    );
    expect(links.map((link) => link.href)).toContain(
      "/tools/cam-gross-up-calculator",
    );
    expect(
      links.every((link) => link.href !== "/blog/what-is-cam-reconciliation"),
    ).toBe(true);
  });

  it("routes BOFU content toward conversion and comparison pages", () => {
    const links = buildContextualLinks({
      currentPath: "/resources/cam-software-evaluation-checklist",
      funnelStage: "bofu",
      audience: "landlord",
      tags: ["yardi"],
    });

    expect(links.map((link) => link.href)).toEqual(
      expect.arrayContaining([
        "/cam-reconciliation-software",
        "/pricing",
        "/vs/yardi",
      ]),
    );
  });
});
