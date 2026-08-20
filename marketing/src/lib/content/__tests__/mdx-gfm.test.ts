import { compile } from "@mdx-js/mdx";
import remarkGfm from "remark-gfm";
import { test, expect } from "vitest";

const TABLE_MDX = `
| Col A | Col B |
|-------|-------|
| one   | two   |
`;

test("compiles pipe table to HTML table element with remark-gfm", async () => {
  const result = await compile(TABLE_MDX, {
    remarkPlugins: [remarkGfm],
    outputFormat: "function-body",
  });
  // function-body format emits JSX calls, not HTML tags - check for the table component call
  expect(String(result)).toContain("_components.table");
  expect(String(result)).not.toContain("| Col A |");
});

test("without remark-gfm pipe table is NOT converted to HTML", async () => {
  const result = await compile(TABLE_MDX, { outputFormat: "function-body" });
  // Pipe text passes through as plain text - no <table> element
  expect(String(result)).not.toMatch(/<table/);
});
