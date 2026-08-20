import { describe, it, expect } from "vitest";
import { createCitationNumberMap } from "@/lib/citations/types";

describe("createCitationNumberMap", () => {
  it("creates stable numbers in first-seen order", () => {
    const map = createCitationNumberMap([
      "yardi-interface",
      "mri-pricing",
      "yardi-interface",
      "boma-standard",
    ]);

    expect(map).toEqual({
      "yardi-interface": 1,
      "mri-pricing": 2,
      "boma-standard": 3,
    });
  });
});
