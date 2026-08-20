/**
 * Faithful Python str()/repr() serializer for JSON-decoded values.
 *
 * The Cloudflare Worker exports endpoint must produce audit-log strings that
 * are byte-for-byte identical to what FastAPI (backend/app/api/v1/exports.py)
 * emits via Python's `str()` on the parsed JSONB value.  This module
 * replicates Python's repr rules for the subset of value shapes that can
 * appear in a PostgreSQL JSONB column parsed by the `postgres` npm library:
 *
 *   - object  -> {'key': <repr>, ...}   (single-quoted keys, insertion order)
 *   - array   -> [<repr>, ...]
 *   - string  -> 'value' or "value"     (Python repr quote-selection rule)
 *   - boolean -> True / False
 *   - null    -> None
 *   - number  -> integer form when value has no fractional part, else float
 *
 * Python's `if entry.get("old_data")` truthiness guard treats the following
 * as falsy: None, "", 0, False, {}, [].  `isFalsyLikePython` replicates that
 * so callers can apply the guard before serializing.
 */

type JsonValue = string | number | boolean | null | JsonObject | JsonArray;

type JsonObject = { [key: string]: JsonValue };
type JsonArray = JsonValue[];

/**
 * Returns true when Python's `if value` would be False — i.e. the value is
 * falsy by Python semantics: None, empty string, 0, False, {}, [].
 */
export function isFalsyLikePython(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value === "";
  if (typeof value === "number") return value === 0;
  if (typeof value === "boolean") return value === false;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value).length === 0;
  return false;
}

/**
 * Serialize a JSON-decoded value to its Python str() representation.
 *
 * Matches Python:
 *   str({'amount': '500', 'status': 'ok'}) -> "{'amount': '500', 'status': 'ok'}"
 *   str([1, 'x'])                           -> "[1, 'x']"
 *   str(True)                               -> 'True'
 *   str(None)                               -> 'None'
 *   str(42)                                 -> '42'
 */
export function toPythonRepr(value: JsonValue): string {
  if (value === null) {
    return "None";
  }
  if (typeof value === "boolean") {
    return value ? "True" : "False";
  }
  if (typeof value === "number") {
    // Integers: no decimal point (matches Python int repr).
    // Floats: use JS default toString which matches Python for common cases.
    if (Number.isInteger(value)) {
      return String(value);
    }
    return String(value);
  }
  if (typeof value === "string") {
    return reprString(value);
  }
  if (Array.isArray(value)) {
    return "[" + value.map(toPythonRepr).join(", ") + "]";
  }
  // Plain object — emit as Python dict literal with single-quoted keys.
  const pairs = Object.entries(value as JsonObject).map(
    ([k, v]) => `${reprString(k)}: ${toPythonRepr(v)}`,
  );
  return "{" + pairs.join(", ") + "}";
}

/**
 * Serialize a JSON-decoded value to its Python str() representation, applying
 * the truthiness guard first.  Returns "" when isFalsyLikePython(value) is
 * true (mirrors `str(entry.get("old_data")) if entry.get("old_data") else ""`
 * in FastAPI exports.py).
 */
export function toPythonReprOrEmpty(value: unknown): string {
  if (isFalsyLikePython(value)) return "";
  return toPythonRepr(value as JsonValue);
}

/**
 * Python repr() for a string value.
 *
 * Quote-selection rule (matches CPython):
 *   - Default: single quotes  -> 'hello'
 *   - If the string contains a single quote AND no double quote: double quotes
 *     -> "it's here"
 *   - Otherwise keep single quotes and escape embedded single quotes with \'
 *     -> 'it\'s "fine"'
 *
 * Always escape backslash (\) first, then apply quote-specific escaping.
 */
function reprString(s: string): string {
  // Escape backslashes first.
  const escaped = s.replace(/\\/g, "\\\\");

  const hasSingle = escaped.includes("'");
  const hasDouble = escaped.includes('"');

  if (hasSingle && !hasDouble) {
    // Use double quotes — no need to escape single quotes inside.
    return `"${escaped}"`;
  }

  // Use single quotes; escape any single quotes inside.
  const inner = escaped.replace(/'/g, "\\'");
  return `'${inner}'`;
}
