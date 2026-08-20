/**
 * Tests for the Python str()/repr() serializer and the truthiness guard used
 * to render audit-log JSONB columns faithfully (matching FastAPI behavior).
 *
 * Covers:
 *  - toPythonRepr: objects, arrays, strings (quote-selection), booleans, null,
 *    integers, floats, nested structures.
 *  - isFalsyLikePython: all falsy shapes and representative truthy values.
 *  - toPythonReprOrEmpty: the combined guard+serializer used by the adapter.
 *  - auditFromRow-level: exercises the mapper with actual parsed-object values
 *    (not pre-stringified strings) to catch [object Object] regressions.
 */

import { describe, expect, it } from "vitest";
import {
  isFalsyLikePython,
  toPythonRepr,
  toPythonReprOrEmpty,
} from "../domain/exports/python-repr";

// ── toPythonRepr ──────────────────────────────────────────────────────────────

describe("toPythonRepr", () => {
  it("serializes null as None", () => {
    expect(toPythonRepr(null)).toBe("None");
  });

  it("serializes true as True", () => {
    expect(toPythonRepr(true)).toBe("True");
  });

  it("serializes false as False", () => {
    expect(toPythonRepr(false)).toBe("False");
  });

  it("serializes integers without a decimal point", () => {
    expect(toPythonRepr(0)).toBe("0");
    expect(toPythonRepr(42)).toBe("42");
    expect(toPythonRepr(-7)).toBe("-7");
  });

  it("serializes floats using JS toString (sufficient for JSONB numeric)", () => {
    expect(toPythonRepr(3.14)).toBe("3.14");
    expect(toPythonRepr(-0.5)).toBe("-0.5");
  });

  // ── strings ────────────────────────────────────────────────────────────────

  it("wraps plain strings in single quotes", () => {
    expect(toPythonRepr("hello")).toBe("'hello'");
    expect(toPythonRepr("")).toBe("''");
  });

  it("uses double quotes when string contains single quote but no double quote", () => {
    expect(toPythonRepr("it's here")).toBe(`"it's here"`);
  });

  it("uses single quotes with escaped inner quote when string has both quote types", () => {
    // Python: 'it\'s "fine"'
    expect(toPythonRepr(`it's "fine"`)).toBe(`'it\\'s "fine"'`);
  });

  it("escapes backslashes", () => {
    // Python: 'C:\\path'
    expect(toPythonRepr("C:\\path")).toBe("'C:\\\\path'");
  });

  // ── arrays ─────────────────────────────────────────────────────────────────

  it("serializes an empty array as []", () => {
    expect(toPythonRepr([])).toBe("[]");
  });

  it("serializes a simple array", () => {
    expect(toPythonRepr([1, "x", true])).toBe("[1, 'x', True]");
  });

  // ── objects ────────────────────────────────────────────────────────────────

  it("serializes an empty object as {}", () => {
    expect(toPythonRepr({})).toBe("{}");
  });

  it("serializes a flat object with string values", () => {
    // The primary case from the FastAPI parity requirement.
    expect(toPythonRepr({ amount: "500", status: "ok" })).toBe(
      "{'amount': '500', 'status': 'ok'}",
    );
  });

  it("serializes a flat object matching the audit fixture format", () => {
    // Mirrors what the DB adapter must produce for a JSONB-parsed row:
    // {amount: "500", status: "ok"} -> "{'amount': '500', 'status': 'ok'}"
    const input = { amount: "500", status: "ok" };
    expect(toPythonRepr(input)).toBe("{'amount': '500', 'status': 'ok'}");
  });

  it("serializes nested object", () => {
    const input = { outer: { inner: 1 } };
    expect(toPythonRepr(input)).toBe("{'outer': {'inner': 1}}");
  });

  it("serializes object with array value", () => {
    const input = { tags: ["a", "b"] };
    expect(toPythonRepr(input)).toBe("{'tags': ['a', 'b']}");
  });

  it("serializes object with boolean and null values", () => {
    const input = { active: true, deleted: false, owner: null };
    expect(toPythonRepr(input)).toBe(
      "{'active': True, 'deleted': False, 'owner': None}",
    );
  });

  it("uses double quotes for object key containing a single quote", () => {
    const input = { "it's": "val" };
    expect(toPythonRepr(input)).toBe(`{"it's": 'val'}`);
  });
});

// ── isFalsyLikePython ─────────────────────────────────────────────────────────

describe("isFalsyLikePython", () => {
  it("treats null as falsy", () => {
    expect(isFalsyLikePython(null)).toBe(true);
  });

  it("treats undefined as falsy", () => {
    expect(isFalsyLikePython(undefined)).toBe(true);
  });

  it("treats empty string as falsy", () => {
    expect(isFalsyLikePython("")).toBe(true);
  });

  it("treats 0 as falsy", () => {
    expect(isFalsyLikePython(0)).toBe(true);
  });

  it("treats false as falsy", () => {
    expect(isFalsyLikePython(false)).toBe(true);
  });

  it("treats empty object {} as falsy", () => {
    expect(isFalsyLikePython({})).toBe(true);
  });

  it("treats empty array [] as falsy", () => {
    expect(isFalsyLikePython([])).toBe(true);
  });

  it("treats non-empty string as truthy", () => {
    expect(isFalsyLikePython("hello")).toBe(false);
  });

  it("treats non-zero number as truthy", () => {
    expect(isFalsyLikePython(1)).toBe(false);
    expect(isFalsyLikePython(-1)).toBe(false);
  });

  it("treats true as truthy", () => {
    expect(isFalsyLikePython(true)).toBe(false);
  });

  it("treats non-empty object as truthy", () => {
    expect(isFalsyLikePython({ a: 1 })).toBe(false);
  });

  it("treats non-empty array as truthy", () => {
    expect(isFalsyLikePython([0])).toBe(false);
  });
});

// ── toPythonReprOrEmpty ───────────────────────────────────────────────────────

describe("toPythonReprOrEmpty", () => {
  it("returns empty string for null", () => {
    expect(toPythonReprOrEmpty(null)).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(toPythonReprOrEmpty(undefined)).toBe("");
  });

  it("returns empty string for empty object", () => {
    expect(toPythonReprOrEmpty({})).toBe("");
  });

  it("returns empty string for empty array", () => {
    expect(toPythonReprOrEmpty([])).toBe("");
  });

  it("returns empty string for empty string", () => {
    expect(toPythonReprOrEmpty("")).toBe("");
  });

  it("returns empty string for 0", () => {
    expect(toPythonReprOrEmpty(0)).toBe("");
  });

  it("returns empty string for false", () => {
    expect(toPythonReprOrEmpty(false)).toBe("");
  });

  it("serializes a non-empty object correctly", () => {
    expect(toPythonReprOrEmpty({ amount: "500", status: "ok" })).toBe(
      "{'amount': '500', 'status': 'ok'}",
    );
  });

  it("serializes a non-empty array correctly", () => {
    expect(toPythonReprOrEmpty([1, 2])).toBe("[1, 2]");
  });

  it("serializes a plain string (truthy) correctly", () => {
    expect(toPythonReprOrEmpty("hello")).toBe("'hello'");
  });

  it("serializes true correctly", () => {
    expect(toPythonReprOrEmpty(true)).toBe("True");
  });
});

// ── Adapter-level regression: parsed objects must NOT produce [object Object] ─

describe("adapter-level serialization regression", () => {
  /**
   * Simulate what auditFromRow() in src/adapters/db/exports.ts does when the
   * postgres lib hands back an already-parsed JS object for a JSONB column.
   * Before the fix, `String(row.old_data)` would produce "[object Object]".
   */
  function simulateAdapterMapping(
    old_data: unknown,
    new_data: unknown,
  ): { old_data: string; new_data: string } {
    return {
      old_data: toPythonReprOrEmpty(old_data),
      new_data: toPythonReprOrEmpty(new_data),
    };
  }

  it("does NOT produce [object Object] for a parsed JSONB object", () => {
    const result = simulateAdapterMapping(
      { amount: "500", status: "ok" },
      null,
    );
    expect(result.old_data).not.toBe("[object Object]");
    expect(result.old_data).toBe("{'amount': '500', 'status': 'ok'}");
    expect(result.new_data).toBe("");
  });

  it("handles both old_data and new_data being non-empty objects", () => {
    const result = simulateAdapterMapping(
      { charge: "1000.00" },
      { charge: "1200.00", note: "adjusted" },
    );
    expect(result.old_data).toBe("{'charge': '1000.00'}");
    expect(result.new_data).toBe("{'charge': '1200.00', 'note': 'adjusted'}");
  });

  it("returns empty string for both when JSONB columns are null (deleted row)", () => {
    const result = simulateAdapterMapping(null, null);
    expect(result.old_data).toBe("");
    expect(result.new_data).toBe("");
  });

  it("returns empty string for empty object old_data (INSERT with no prior row)", () => {
    const result = simulateAdapterMapping({}, { amount: "500" });
    expect(result.old_data).toBe("");
    expect(result.new_data).toBe("{'amount': '500'}");
  });

  it("handles nested object in JSONB", () => {
    const result = simulateAdapterMapping(
      { address: { street: "123 Main", city: "Springville" } },
      null,
    );
    expect(result.old_data).toBe(
      "{'address': {'street': '123 Main', 'city': 'Springville'}}",
    );
  });

  it("handles a string value containing a single quote in object field", () => {
    const result = simulateAdapterMapping({ name: "O'Brien" }, null);
    // key 'name' uses single quotes; value "O'Brien" triggers double-quote rule
    expect(result.old_data).toBe(`{'name': "O'Brien"}`);
  });
});
