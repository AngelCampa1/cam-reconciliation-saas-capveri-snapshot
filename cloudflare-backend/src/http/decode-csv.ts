// Leaf module: no imports from any http route module. Keep it dependency-free
// so it cannot participate in a circular-import-at-eval cycle (a prior cycle
// hit an errors<->postgres<->platform cycle that left a class undefined at
// eval time — this module must never be part of such a cycle).
//
// Decodes a CSV upload's raw bytes to text. Strict UTF-8 first (rejecting
// invalid byte sequences instead of silently replacing them with U+FFFD
// mojibake), falling back to windows-1252 for legacy ERP exports that are not
// valid UTF-8 (e.g. a raw 0xE9 byte for "é" in a tenant/property name).
export function decodeCsv(bytes: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(
      bytes,
    );
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}
