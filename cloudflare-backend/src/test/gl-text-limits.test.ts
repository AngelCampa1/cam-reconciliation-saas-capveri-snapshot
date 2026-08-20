import { describe, expect, it } from "vitest";
import {
  GL_TEXT_FIELD_LIMITS,
  findFirstTextFieldTooLong,
  type GlTextFields,
} from "../domain/ingestion/gl-text-limits";

function entry(overrides: Partial<GlTextFields> = {}): GlTextFields {
  return {
    account_code: "6000",
    account_description: "Common area maintenance",
    vendor_name: "Acme Janitorial",
    description: "Monthly cleaning",
    ...overrides,
  };
}

describe("findFirstTextFieldTooLong", () => {
  it("returns null when every field fits within its column width", () => {
    expect(findFirstTextFieldTooLong([entry(), entry()])).toBeNull();
  });

  it("returns null when nullable fields are null", () => {
    expect(
      findFirstTextFieldTooLong([
        entry({ vendor_name: null, description: null }),
      ]),
    ).toBeNull();
  });

  it("accepts a value exactly at the limit", () => {
    expect(
      findFirstTextFieldTooLong([
        entry({ account_code: "a".repeat(GL_TEXT_FIELD_LIMITS.account_code) }),
      ]),
    ).toBeNull();
  });

  it("flags an account_code one character over the limit", () => {
    expect(
      findFirstTextFieldTooLong([
        entry({
          account_code: "a".repeat(GL_TEXT_FIELD_LIMITS.account_code + 1),
        }),
      ]),
    ).toEqual({ index: 0, field: "account_code", limit: 50 });
  });

  it("flags an over-length nullable description", () => {
    expect(
      findFirstTextFieldTooLong([
        entry({
          description: "x".repeat(GL_TEXT_FIELD_LIMITS.description + 1),
        }),
      ]),
    ).toEqual({ index: 0, field: "description", limit: 1000 });
  });

  it("reports the first violating row by index", () => {
    expect(
      findFirstTextFieldTooLong([
        entry(),
        entry({
          vendor_name: "v".repeat(GL_TEXT_FIELD_LIMITS.vendor_name + 1),
        }),
      ]),
    ).toEqual({ index: 1, field: "vendor_name", limit: 255 });
  });

  it("checks fields in a stable order so the reported violation is deterministic", () => {
    // account_code violates before account_description in field order.
    expect(
      findFirstTextFieldTooLong([
        entry({
          account_code: "a".repeat(GL_TEXT_FIELD_LIMITS.account_code + 1),
          account_description: "d".repeat(
            GL_TEXT_FIELD_LIMITS.account_description + 1,
          ),
        }),
      ]),
    ).toEqual({ index: 0, field: "account_code", limit: 50 });
  });
});
