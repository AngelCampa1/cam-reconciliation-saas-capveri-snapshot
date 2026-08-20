import { describe, expect, it } from "vitest";

import { buttonVariants } from "./button";

describe("buttonVariants", () => {
  it("uses the button radius token across sizes", () => {
    expect(buttonVariants({ size: "default" })).toContain("rounded-button");
    expect(buttonVariants({ size: "sm" })).not.toContain("rounded-md");
    expect(buttonVariants({ size: "lg" })).not.toContain("rounded-md");
  });
});
