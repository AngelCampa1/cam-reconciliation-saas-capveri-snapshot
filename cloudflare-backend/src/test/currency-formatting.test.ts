import { describe, expect, it } from "vitest";
import { formatUsd, formatTraceValue } from "../domain/formatting/currency";

describe("formatUsd", () => {
  it("formats a positive integer", () => {
    expect(formatUsd(1234)).toBe("$1,234.00");
  });

  it("formats a positive decimal", () => {
    expect(formatUsd("1234.56")).toBe("$1,234.56");
  });

  it("formats zero", () => {
    expect(formatUsd(0)).toBe("$0.00");
  });

  it("formats a negative value with leading minus", () => {
    expect(formatUsd(-1234.56)).toBe("-$1,234.56");
  });

  it("formats a large value with thousands separators", () => {
    expect(formatUsd("1234567.89")).toBe("$1,234,567.89");
  });

  it("formats a small decimal rounding to 2 places", () => {
    expect(formatUsd("0.5")).toBe("$0.50");
  });
});

describe("formatTraceValue", () => {
  it("formats currency unit", () => {
    expect(formatTraceValue("5000", "currency")).toBe("$5,000.00");
  });

  it("defaults to currency when unit omitted", () => {
    expect(formatTraceValue("100")).toBe("$100.00");
  });

  it("formats ratio to 4 decimal places", () => {
    expect(formatTraceValue("0.95", "ratio")).toBe("0.9500");
  });

  it("formats negative ratio", () => {
    expect(formatTraceValue("-0.5", "ratio")).toBe("-0.5000");
  });

  it("formats area as sq ft with 2 decimals", () => {
    expect(formatTraceValue("2500.75", "area")).toBe("2,500.75 sq ft");
  });

  it("formats integer area without decimals", () => {
    expect(formatTraceValue("2500", "area")).toBe("2,500 sq ft");
  });

  it("formats count as integer with thousands sep", () => {
    expect(formatTraceValue("1234567", "count")).toBe("1,234,567");
  });

  it("formats date/text as string passthrough", () => {
    expect(formatTraceValue("2026-01-01", "date")).toBe("2026-01-01");
    expect(formatTraceValue("some label", "text")).toBe("some label");
  });

  it("falls back to string for non-numeric currency", () => {
    expect(formatTraceValue("n/a", "currency")).toBe("n/a");
  });

  it("falls back to string for null", () => {
    expect(formatTraceValue(null, "currency")).toBe("null");
  });

  it("normalizes undefined to the same output as null", () => {
    expect(formatTraceValue(undefined, "currency")).toBe("null");
  });
});
