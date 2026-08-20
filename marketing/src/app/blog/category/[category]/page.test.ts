import { describe, expect, it } from "vitest";
import { generateStaticParams } from "./page";

describe("BlogCategoryPage static params", () => {
  it("includes legacy cam-reconciliation alias so production redirects instead of 404ing", () => {
    expect(generateStaticParams()).toContainEqual({
      category: "cam-reconciliation",
    });
  });
});
