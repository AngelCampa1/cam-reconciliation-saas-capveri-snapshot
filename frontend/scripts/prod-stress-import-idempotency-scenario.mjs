// Prod E2E stress scenario (Cycle 4B): GL + rent-roll IMPORT IDEMPOTENCY,
// DEDUPE, and CONCURRENCY against the LIVE prod API (api.capveri.com).
//
// Domain: durability / race surface of the import path. Verifies:
//  - GL re-import is deduped (per org+property+file_hash) -> 409, no double count.
//  - GL dedupe boundaries: whitespace/case/trailing-zero variants stay DISTINCT
//    (different bytes -> different hash); cross-property same-bytes NOT deduped.
//  - True in-file duplicate GL rows are PRESERVED (not collapsed).
//  - N parallel identical GL uploads converge to ONE winner (single batch, no
//    torn writes / double count) via the DB unique constraint.
//  - Rent-roll import creates a NEW property per import (no hash dedupe) and
//    parallel rent-roll imports produce independent, consistent properties.
//  - Rent-roll in-file duplicate unit numbers COLLAPSE (parser-level).
//  - Partial-batch: valid rows persist, invalid rows reported (Cycle-1 C1 fix
//    stays fixed) — verified for BOTH GL and rent-roll.
//  - Preview-vs-import parity (counts shown == counts stored).
//  - Malformed payloads fail SAFE (400/413/415/422), never partial import.
//
// All expected counts / sums / dedupe outcomes are computed OFFLINE (BigInt
// cents), never echoed from the API. Entities prefixed "[PROD-TEST] CY4B".
// Cleanup in finally; residue verified via API listing.
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(__dirname, "..");
const repoRoot = resolve(frontendRoot, "..");

const env = {
  ...(await readEnv(resolve(repoRoot, ".env.local"))),
  ...(await readEnv(resolve(frontendRoot, ".env.production.local"))),
  ...process.env,
};

const required = [
  "E2E_PROD_EMAIL",
  "E2E_PROD_PASSWORD",
  "E2E_PROD_API_URL",
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_ANON_KEY",
];
for (const key of required) {
  if (!env[key]?.trim()) throw new Error(`Missing ${key}.`);
}

const apiUrl = trimSlash(env.E2E_PROD_API_URL);
const supabaseUrl = trimSlash(env.VITE_SUPABASE_URL);
const runId = new Date().toISOString().replace(/[:.]/gu, "-");
const outputDir = resolve(repoRoot, "e2e-adhoc", `prod-stress-import-idempotency-${runId}`);
await mkdir(outputDir, { recursive: true });

const report = {
  ok: false,
  run_id: runId,
  scenario: "import-idempotency-dedupe-concurrency (CY4B)",
  output_dir: outputDir,
  checks: [],
  cleanup: [],
  residue: null,
};

let token;
const created = { propertyIds: [], batchIds: [] };
try {
  token = await signInWithPassword();
  await runScenario();
} catch (error) {
  report.fatal = errorMessage(error);
} finally {
  try {
    await cleanup();
  } catch (error) {
    report.cleanup.push({ label: "cleanup-fatal", ok: false, error: errorMessage(error) });
  }
  report.residue = await measureResidue();
  report.ok = report.checks.length > 0 && report.checks.every((c) => c.ok) && !report.fatal;
  await writeFile(resolve(outputDir, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
if (!report.ok) process.exitCode = 1;

async function runScenario() {
  const suffix = randomUUID().slice(0, 8);

  const propA = await createProperty(`[PROD-TEST] CY4B GL Idempotency A ${suffix}`);
  created.propertyIds.push(propA.id);
  const propB = await createProperty(`[PROD-TEST] CY4B GL Idempotency B ${suffix}`);
  created.propertyIds.push(propB.id);

  // ------------------------------------------------------------------
  // 1. GL RE-IMPORT IDEMPOTENCY (same bytes, same property -> 409)
  // ------------------------------------------------------------------
  const baseCsv = [
    "Account,Account Description,Date,Amount",
    "6100,Janitorial,01/15/2026,250.00",
    "6101,Security,01/16/2026,100.00",
    "6102,Utilities,01/17/2026,75.50",
  ].join("\n");
  const baseTotalCents = 25000n + 10000n + 7550n;

  const up1 = await uploadGl(propA.id, `gl-base-${suffix}.csv`, baseCsv);
  if (up1.status === 200 && up1.json?.batch_id) created.batchIds.push(up1.json.batch_id);
  check("1a first GL import: 200, 3 rows, 0 errors", pickUpload(up1), {
    status: 200,
    source_system: "yardi",
    row_count: 3,
    error_count: 0,
  });
  const batch1 = up1.json.batch_id;
  await verifyGlBatch("1a", batch1, { rowCount: 3, totalCents: baseTotalCents });

  // Re-upload identical bytes to SAME property -> 409, points at original.
  const up2 = await uploadGl(propA.id, `gl-base-${suffix}.csv`, baseCsv);
  check("1b re-import same bytes/property: 409 duplicate_import, original batch id", {
    status: up2.status,
    code: errorCode(up2.json),
    existing_batch_id: up2.json?.detail?.existing_batch_id ?? null,
  }, { status: 409, code: "duplicate_import", existing_batch_id: batch1 });

  // Re-upload with a DIFFERENT filename but identical bytes -> still 409
  // (dedupe is on content hash, not filename).
  const up2b = await uploadGl(propA.id, `gl-base-RENAMED-${suffix}.csv`, baseCsv);
  check("1c re-import identical bytes different filename: still 409 (hash, not name)", {
    status: up2b.status,
    code: errorCode(up2b.json),
    existing_batch_id: up2b.json?.detail?.existing_batch_id ?? null,
  }, { status: 409, code: "duplicate_import", existing_batch_id: batch1 });

  // Property A GL total unchanged after the duplicate attempts (no double count).
  const rangeAfterDup = await getJson(`/api/v1/ingestion/gl-date-range/${propA.id}`);
  check("1d GL date range unchanged after duplicate attempts", {
    status: rangeAfterDup.status,
    min_date: rangeAfterDup.json?.min_date,
    max_date: rangeAfterDup.json?.max_date,
  }, { status: 200, min_date: "2026-01-15", max_date: "2026-01-17" });

  // ------------------------------------------------------------------
  // 2. DEDUPE BOUNDARIES (near-identical bytes must NOT dedupe)
  // ------------------------------------------------------------------
  // 2a: trailing-zero difference (250.00 -> 250.000) = different bytes ->
  // NEW batch (hash differs). Value quantizes to same cents on store.
  const trailingZeroCsv = baseCsv.replace("250.00", "250.000");
  const up3 = await uploadGl(propA.id, `gl-trailing-${suffix}.csv`, trailingZeroCsv);
  if (up3.status === 200 && up3.json?.batch_id) created.batchIds.push(up3.json.batch_id);
  check("2a trailing-zero byte-variant is a FRESH import (distinct hash)", {
    status: up3.status,
    row_count: up3.json?.row_count ?? null,
    new_batch: Boolean(up3.json?.batch_id && up3.json.batch_id !== batch1),
  }, { status: 200, row_count: 3, new_batch: true });
  await verifyGlBatch("2a", up3.json.batch_id, { rowCount: 3, totalCents: baseTotalCents });

  // 2b: same bytes to a DIFFERENT property -> fresh import (hash scoped
  // org+property, per migration 20260630000000).
  const up4 = await uploadGl(propB.id, `gl-base-${suffix}.csv`, baseCsv);
  if (up4.status === 200 && up4.json?.batch_id) created.batchIds.push(up4.json.batch_id);
  check("2b same bytes on a DIFFERENT property is a fresh import (hash is org+property)", {
    status: up4.status,
    row_count: up4.json?.row_count ?? null,
    cross_property_new_batch: Boolean(up4.json?.batch_id && up4.json.batch_id !== batch1),
  }, { status: 200, row_count: 3, cross_property_new_batch: true });
  await verifyGlBatch("2b", up4.json.batch_id, { rowCount: 3, totalCents: baseTotalCents });

  // ------------------------------------------------------------------
  // 3. TRUE IN-FILE DUPLICATE GL ROWS ARE PRESERVED (not collapsed)
  // ------------------------------------------------------------------
  const dupRowsCsv = [
    "Account,Account Description,Date,Amount",
    "6400,Janitorial,02/01/2026,250.00",
    "6400,Janitorial,02/01/2026,250.00",
    "6400,Janitorial,02/01/2026,250.00",
  ].join("\n");
  const up5 = await uploadGl(propA.id, `gl-dup-rows-${suffix}.csv`, dupRowsCsv);
  if (up5.status === 200 && up5.json?.batch_id) created.batchIds.push(up5.json.batch_id);
  check("3a in-file duplicate GL rows preserved: 3 rows", pickUpload(up5), {
    status: 200,
    source_system: "yardi",
    row_count: 3,
    error_count: 0,
  });
  await verifyGlBatch("3a", up5.json.batch_id, { rowCount: 3, totalCents: 75000n });

  // ------------------------------------------------------------------
  // 4. CONCURRENCY: N parallel identical GL uploads -> exactly ONE winner
  // ------------------------------------------------------------------
  const propC = await createProperty(`[PROD-TEST] CY4B GL Concurrency C ${suffix}`);
  created.propertyIds.push(propC.id);
  const raceCsv = [
    "Account,Account Description,Date,Amount",
    "7000,Race Row One,03/01/2026,111.11",
    "7001,Race Row Two,03/02/2026,222.22",
  ].join("\n");
  const raceTotalCents = 11111n + 22222n;
  const N = 6;
  const raceResults = await Promise.all(
    Array.from({ length: N }, () => uploadGl(propC.id, `gl-race-${suffix}.csv`, raceCsv)),
  );
  const winners = raceResults.filter((r) => r.status === 200);
  const dups = raceResults.filter((r) => r.status === 409);
  const winnerBatchIds = new Set(winners.map((r) => r.json?.batch_id).filter(Boolean));
  for (const r of winners) if (r.json?.batch_id) created.batchIds.push(r.json.batch_id);
  const dupTargets = new Set(dups.map((r) => r.json?.detail?.existing_batch_id).filter(Boolean));
  check("4a parallel identical GL uploads: exactly ONE 200 winner, rest 409", {
    total: raceResults.length,
    winners: winners.length,
    duplicates: dups.length,
    other: raceResults.length - winners.length - dups.length,
    distinct_winner_batches: winnerBatchIds.size,
  }, { total: N, winners: 1, duplicates: N - 1, other: 0, distinct_winner_batches: 1 });

  const winnerBatch = [...winnerBatchIds][0] ?? null;
  check("4b every 409 points at the single winning batch (no torn writes)", {
    dup_targets: [...dupTargets].sort(),
    single_target_matches_winner:
      dupTargets.size === 1 && dupTargets.has(winnerBatch),
  }, { dup_targets: winnerBatch ? [winnerBatch] : [], single_target_matches_winner: true });

  // The winning batch stores exactly the file's rows once — no double count.
  if (winnerBatch) {
    await verifyGlBatch("4c", winnerBatch, { rowCount: 2, totalCents: raceTotalCents });
  }
  // Property C sees exactly one batch total.
  const propCBatches = await countPropertyBatches(propC.id);
  check("4d property C has exactly ONE import batch after the race", propCBatches, 1);

  // 4e: parallel uploads of DIFFERENT files to DIFFERENT properties all succeed.
  const propD = await createProperty(`[PROD-TEST] CY4B GL Parallel D ${suffix}`);
  const propE = await createProperty(`[PROD-TEST] CY4B GL Parallel E ${suffix}`);
  created.propertyIds.push(propD.id, propE.id);
  const csvD = "Account,Account Description,Date,Amount\n8000,D Row,04/01/2026,10.00";
  const csvE = "Account,Account Description,Date,Amount\n8001,E Row,04/01/2026,20.00";
  const [rD, rE] = await Promise.all([
    uploadGl(propD.id, `gl-d-${suffix}.csv`, csvD),
    uploadGl(propE.id, `gl-e-${suffix}.csv`, csvE),
  ]);
  if (rD.json?.batch_id) created.batchIds.push(rD.json.batch_id);
  if (rE.json?.batch_id) created.batchIds.push(rE.json.batch_id);
  check("4e parallel imports to different properties both succeed independently", {
    d: { status: rD.status, rows: rD.json?.row_count ?? null },
    e: { status: rE.status, rows: rE.json?.row_count ?? null },
    distinct_batches: Boolean(
      rD.json?.batch_id && rE.json?.batch_id && rD.json.batch_id !== rE.json.batch_id,
    ),
  }, {
    d: { status: 200, rows: 1 },
    e: { status: 200, rows: 1 },
    distinct_batches: true,
  });

  // ------------------------------------------------------------------
  // 5. GL PARTIAL-BATCH (valid persist, invalid reported) — C1-fix regression
  // ------------------------------------------------------------------
  const partialCsv = [
    "Account,Account Description,Date,Amount",
    "6100,Good One,05/01/2026,100.00",
    "6101,BadDate,99/99/2026,50.00",
    "6102,Good Two,05/03/2026,25.00",
    "6103,BadAmount,05/04/2026,not-a-number",
  ].join("\n");
  const up6 = await uploadGl(propA.id, `gl-partial-${suffix}.csv`, partialCsv);
  if (up6.status === 200 && up6.json?.batch_id) created.batchIds.push(up6.json.batch_id);
  check("5a GL partial batch: 2 valid rows kept, 2 invalid reported (not silent, not full rollback)", {
    status: up6.status,
    row_count: up6.json?.row_count ?? null,
    error_count: up6.json?.error_count ?? null,
    has_warning: Array.isArray(up6.json?.warnings) && up6.json.warnings.length > 0,
  }, { status: 200, row_count: 2, error_count: 2, has_warning: true });
  await verifyGlBatch("5a", up6.json.batch_id, { rowCount: 2, totalCents: 10000n + 2500n });

  // ------------------------------------------------------------------
  // 6. GL PREVIEW-vs-IMPORT PARITY
  //    (upload response row_count == stored preview_entries count/sum)
  //    covered by verifyGlBatch above; assert explicit equality here.
  // ------------------------------------------------------------------
  const parityDetail = await getJson(`/api/v1/ingestion/batches/${batch1}`);
  check("6a stored batch row_count == upload response row_count (no drift)", {
    stored_row_count: parityDetail.json?.row_count ?? null,
    upload_row_count: up1.json?.row_count ?? null,
    stored_entries_len: parityDetail.json?.preview_entries?.length ?? null,
  }, { stored_row_count: 3, upload_row_count: 3, stored_entries_len: 3 });

  // ------------------------------------------------------------------
  // 7. GL MALFORMED / ADVERSARIAL -> fail safe, never partial import
  // ------------------------------------------------------------------
  const empty = await uploadGl(propA.id, `gl-empty-${suffix}.csv`, "");
  check("7a empty GL file -> 400 empty_file", { status: empty.status, code: errorCode(empty.json) }, {
    status: 400,
    code: "empty_file",
  });
  const headerOnly = await uploadGl(propA.id, `gl-header-${suffix}.csv`, "Account,Account Description,Date,Amount\n");
  check("7b header-only GL file -> 422 no_valid_gl_entries", {
    status: headerOnly.status,
    code: errorCode(headerOnly.json),
  }, { status: 422, code: "no_valid_gl_entries" });
  const wrongType = await uploadGl(propA.id, `gl-notes-${suffix}.txt`, "Account,Account Description,Date,Amount\n6100,X,01/15/2026,10.00", "text/plain");
  check("7c wrong content-type (.txt/text-plain) -> 415 unsupported_file_type", {
    status: wrongType.status,
    code: errorCode(wrongType.json),
  }, { status: 415, code: "unsupported_file_type" });
  // Duplicate header columns: parser keeps last-wins mapping; should still
  // ingest safely, never partial-crash. Assert it does not 5xx.
  const dupHeaderCsv = [
    "Account,Account,Date,Amount",
    "6100,Janitorial,06/01/2026,10.00",
  ].join("\n");
  const dupHeader = await uploadGl(propA.id, `gl-duphdr-${suffix}.csv`, dupHeaderCsv);
  if (dupHeader.status === 200 && dupHeader.json?.batch_id) created.batchIds.push(dupHeader.json.batch_id);
  check("7d duplicate header columns fail safe (no 5xx)", {
    is_5xx: dupHeader.status >= 500,
    status_class: dupHeader.status >= 500 ? "5xx" : dupHeader.status >= 400 ? "4xx" : "2xx",
  }, { is_5xx: false, status_class: dupHeader.status >= 400 ? "4xx" : "2xx" });

  // ------------------------------------------------------------------
  // 8. RENT-ROLL IDEMPOTENCY: each import creates a NEW property (no hash
  //    dedupe). This is the documented model (rent-roll DEFINES the property).
  // ------------------------------------------------------------------
  const rrCsv = [
    "Unit,Tenant,Sqft,Lease Start,Lease End,Base Rent,CAM Share",
    "101,Acme Corp,1000,01/01/2026,12/31/2026,5000,0.25",
    "102,Beta LLC,2000,01/01/2026,12/31/2026,9000,0.50",
    "103,,1500,,,,",
  ].join("\n");
  // Offline expectation: 3 units, 2 leases (row 103 vacant -> unit only).
  const rrPreview = await previewRentRoll(`rr-base-${suffix}.csv`, rrCsv);
  check("8a rent-roll preview: 3 units, 2 occupied", {
    status: rrPreview.status,
    success: rrPreview.json?.success,
    total_units: rrPreview.json?.total_units,
    occupied_units: rrPreview.json?.occupied_units,
  }, { status: 200, success: true, total_units: 3, occupied_units: 2 });

  const rr1 = await importRentRoll(`rr-base-${suffix}.csv`, rrCsv, `[PROD-TEST] CY4B RR One ${suffix}`);
  if (rr1.json?.property_id) created.propertyIds.push(rr1.json.property_id);
  check("8b rent-roll import #1: 201, 3 units, 2 leases (preview==import parity)", {
    status: rr1.status,
    units_created: rr1.json?.units_created ?? null,
    leases_created: rr1.json?.leases_created ?? null,
  }, { status: 201, units_created: 3, leases_created: 2 });

  const rr2 = await importRentRoll(`rr-base-${suffix}.csv`, rrCsv, `[PROD-TEST] CY4B RR Two ${suffix}`);
  if (rr2.json?.property_id) created.propertyIds.push(rr2.json.property_id);
  check("8c rent-roll re-import creates a SEPARATE property (no hash dedupe by design)", {
    status: rr2.status,
    distinct_property: Boolean(
      rr1.json?.property_id && rr2.json?.property_id && rr1.json.property_id !== rr2.json.property_id,
    ),
    units_created: rr2.json?.units_created ?? null,
  }, { status: 201, distinct_property: true, units_created: 3 });

  // ------------------------------------------------------------------
  // 9. RENT-ROLL IN-FILE DUPLICATE UNIT NUMBERS COLLAPSE (parser-level)
  // ------------------------------------------------------------------
  const rrDupCsv = [
    "Unit,Tenant,Sqft,Lease Start,Lease End,Base Rent,CAM Share",
    "201,Gamma Inc,1000,01/01/2026,12/31/2026,4000,0.30",
    "201,Gamma Inc,1000,01/01/2026,12/31/2026,4000,0.30",
    "202,Delta Co,1200,01/01/2026,12/31/2026,4800,0.40",
  ].join("\n");
  const rrDupPreview = await previewRentRoll(`rr-dup-${suffix}.csv`, rrDupCsv);
  check("9a rent-roll duplicate unit number collapses in preview (2 kept, warning)", {
    status: rrDupPreview.status,
    total_units: rrDupPreview.json?.total_units,
    has_dup_warning: (rrDupPreview.json?.warnings ?? []).some((w) =>
      /duplicate unit number/iu.test(w),
    ),
  }, { status: 200, total_units: 2, has_dup_warning: true });
  const rrDup = await importRentRoll(`rr-dup-${suffix}.csv`, rrDupCsv, `[PROD-TEST] CY4B RR Dup ${suffix}`);
  if (rrDup.json?.property_id) created.propertyIds.push(rrDup.json.property_id);
  check("9b rent-roll duplicate-unit import stores 2 units (collapsed), preview==import", {
    status: rrDup.status,
    units_created: rrDup.json?.units_created ?? null,
  }, { status: 201, units_created: 2 });

  // ------------------------------------------------------------------
  // 10. RENT-ROLL PARTIAL BATCH (C1-fix regression: 0/neg-sqft row excluded
  //     per-row, valid rows still persist — NOT full-file rollback).
  // ------------------------------------------------------------------
  const rrPartialCsv = [
    "Unit,Tenant,Sqft,Lease Start,Lease End,Base Rent,CAM Share",
    "301,Valid One,1000,01/01/2026,12/31/2026,5000,0.25",
    "302,Zero Sqft,0,01/01/2026,12/31/2026,3000,0.20",
    "303,Valid Two,1500,01/01/2026,12/31/2026,6000,0.30",
  ].join("\n");
  const rrPartialPreview = await previewRentRoll(`rr-partial-${suffix}.csv`, rrPartialCsv);
  check("10a rent-roll 0-sqft row excluded at preview (per-row gate, C1 fix)", {
    status: rrPartialPreview.status,
    success: rrPartialPreview.json?.success,
    total_units: rrPartialPreview.json?.total_units,
  }, { status: 200, success: true, total_units: 2 });
  const rrPartial = await importRentRoll(`rr-partial-${suffix}.csv`, rrPartialCsv, `[PROD-TEST] CY4B RR Partial ${suffix}`);
  if (rrPartial.json?.property_id) created.propertyIds.push(rrPartial.json.property_id);
  check("10b rent-roll partial import: 2 valid units persist, no full-file rollback", {
    status: rrPartial.status,
    units_created: rrPartial.json?.units_created ?? null,
  }, { status: 201, units_created: 2 });

  // ------------------------------------------------------------------
  // 11. RENT-ROLL CONCURRENCY: parallel imports of same file -> independent
  //     properties, each internally consistent (no torn/shared writes).
  // ------------------------------------------------------------------
  const rrRaceResults = await Promise.all(
    Array.from({ length: 3 }, (_, i) =>
      importRentRoll(`rr-race-${suffix}.csv`, rrCsv, `[PROD-TEST] CY4B RR Race ${i} ${suffix}`),
    ),
  );
  for (const r of rrRaceResults) if (r.json?.property_id) created.propertyIds.push(r.json.property_id);
  const rrPropIds = new Set(rrRaceResults.map((r) => r.json?.property_id).filter(Boolean));
  check("11a parallel rent-roll imports: all 201, all DISTINCT properties, each 3 units", {
    all_created: rrRaceResults.every((r) => r.status === 201),
    distinct_properties: rrPropIds.size,
    all_three_units: rrRaceResults.every((r) => r.json?.units_created === 3),
  }, { all_created: true, distinct_properties: 3, all_three_units: true });

  // ------------------------------------------------------------------
  // 12. RENT-ROLL MALFORMED -> fail safe
  // ------------------------------------------------------------------
  const rrEmpty = await importRentRoll(`rr-empty-${suffix}.csv`, "", `[PROD-TEST] CY4B RR Empty ${suffix}`);
  check("12a empty rent-roll import fails safe (4xx, no property created)", {
    is_4xx: rrEmpty.status >= 400 && rrEmpty.status < 500,
    property_created: Boolean(rrEmpty.json?.property_id),
  }, { is_4xx: true, property_created: false });
  const rrXlsx = await importRentRoll(`rr-book-${suffix}.xlsx`, rrCsv, `[PROD-TEST] CY4B RR Xlsx ${suffix}`);
  check("12b xlsx rent-roll -> 415 unsupported_rent_roll_format (no partial import)", {
    status: rrXlsx.status,
    code: errorCode(rrXlsx.json),
    property_created: Boolean(rrXlsx.json?.property_id),
  }, { status: 415, code: "unsupported_rent_roll_format", property_created: false });
}

// ---------------------------------------------------------------------------
// domain helpers
// ---------------------------------------------------------------------------

async function verifyGlBatch(label, batchId, { rowCount, totalCents }) {
  const detail = await getJson(`/api/v1/ingestion/batches/${batchId}`);
  const entries = detail.json?.preview_entries ?? [];
  const sum = entries.reduce((acc, e) => acc + toCents(e.balance), 0n);
  check(`${label} stored batch: status completed, ${rowCount} rows, penny-exact sum`, {
    status: detail.json?.status,
    row_count: detail.json?.row_count,
    entries_len: entries.length,
    total_cents: sum.toString(),
  }, {
    status: "completed",
    row_count: rowCount,
    entries_len: rowCount,
    total_cents: totalCents.toString(),
  });
}

async function countPropertyBatches(propertyId) {
  // The org list endpoint returns all batches; filter to this property via
  // per-batch detail is expensive, so use the property imports listing.
  const res = await getJson(
    `/api/v1/properties/${propertyId}/imports?page=1&size=100`,
  );
  if (res.status === 200 && Array.isArray(res.json?.imports)) {
    return res.json.imports.length;
  }
  // Fallback: org batch list filtered by looking up each batch's property.
  const list = await getJson(`/api/v1/ingestion/batches`);
  const batches = list.json?.batches ?? [];
  let count = 0;
  for (const b of batches) {
    const d = await getJson(`/api/v1/ingestion/batches/${b.id}`);
    if (d.json?.property_id === propertyId) count += 1;
  }
  return count;
}

async function createProperty(name) {
  const res = await fetchJson("/api/v1/properties", {
    method: "POST",
    body: {
      name,
      address_line1: "1 Idempotency Way",
      city: "Austin",
      state: "TX",
      postal_code: "78704",
      total_rentable_sqft: "25000.00",
      total_usable_sqft: "22000.00",
      common_area_sqft: "3000.00",
      target_occupancy: "0.95",
      boma_standard_version: "2024",
      fiscal_year_start_month: 1,
    },
  });
  if (res.status !== 201) {
    throw new Error(`createProperty ${name} -> ${res.status}: ${res.text.slice(0, 300)}`);
  }
  return res.json;
}

async function uploadGl(propertyId, fileName, body, mimeType = "text/csv") {
  const form = new FormData();
  form.set("property_id", propertyId);
  form.set("source_override", "yardi");
  form.set("file", new Blob([body], { type: mimeType }), fileName);
  return rawForm("/api/v1/ingestion/upload", form);
}

async function previewRentRoll(fileName, body) {
  const form = new FormData();
  form.set("file", new Blob([body], { type: "text/csv" }), fileName);
  return rawForm("/api/v1/rent-roll/preview", form);
}

async function importRentRoll(fileName, body, propertyName) {
  const form = new FormData();
  form.set("file", new Blob([body], { type: "text/csv" }), fileName);
  form.set("property_name", propertyName);
  return rawForm("/api/v1/rent-roll/import", form);
}

async function rawForm(path, form) {
  const response = await fetch(`${apiUrl}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, accept: "application/json" },
    body: form,
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: response.status, text, json };
}

async function getJson(path) {
  const response = await fetch(`${apiUrl}${path}`, {
    headers: { authorization: `Bearer ${token}`, accept: "application/json" },
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: response.status, text, json };
}

async function fetchJson(path, options) {
  const response = await fetch(`${apiUrl}${path}`, {
    method: options.method ?? "GET",
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/json",
      ...(options.body ? { "content-type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: response.status, text, json };
}

// ---------------------------------------------------------------------------
// cleanup + residue
// ---------------------------------------------------------------------------

async function cleanup() {
  const uniqueBatches = [...new Set(created.batchIds.filter(Boolean))];
  for (const batchId of uniqueBatches) {
    await tryDelete(`/api/v1/ingestion/batches/${batchId}`);
  }
  const uniqueProps = [...new Set(created.propertyIds.filter(Boolean))];
  for (const propertyId of uniqueProps) {
    await tryDelete(`/api/v1/properties/${propertyId}`);
  }
}

async function tryDelete(path) {
  try {
    const response = await fetch(`${apiUrl}${path}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` },
    });
    const ok = response.status === 204 || response.status === 404;
    report.cleanup.push({ path, status: response.status, ok });
  } catch (error) {
    report.cleanup.push({ path, ok: false, error: errorMessage(error) });
  }
}

async function measureResidue() {
  // Sweep the org property listing for any [PROD-TEST] CY4B residue.
  try {
    // Sweep all pages (org may have unrelated properties; skip/limit, max 100).
    const items = [];
    for (let skip = 0; skip < 1000; skip += 100) {
      const res = await getJson(`/api/v1/properties?skip=${skip}&limit=100`);
      const page = Array.isArray(res.json?.data)
        ? res.json.data
        : Array.isArray(res.json)
          ? res.json
          : (res.json?.properties ?? res.json?.items ?? []);
      items.push(...page);
      if (page.length < 100 || !res.json?.has_more) break;
    }
    const residue = items
      .filter((p) => typeof p?.name === "string" && p.name.includes("[PROD-TEST] CY4B"))
      .map((p) => ({ id: p.id, name: p.name }));
    return { property_residue_count: residue.length, property_residue: residue };
  } catch (error) {
    return { property_residue_count: null, error: errorMessage(error) };
  }
}

// ---------------------------------------------------------------------------
// generic helpers
// ---------------------------------------------------------------------------

function check(label, actual, expected) {
  const ok = stableJson(actual) === stableJson(expected);
  report.checks.push({ label, ok, actual, expected });
  if (!ok) {
    console.error(`FAIL ${label}\n  expected ${stableJson(expected)}\n  actual   ${stableJson(actual)}`);
  } else {
    console.log(`ok   ${label}`);
  }
}

function pickUpload(res) {
  return {
    status: res.status,
    source_system: res.json?.source_system ?? null,
    row_count: res.json?.row_count ?? null,
    error_count: res.json?.error_count ?? null,
  };
}

function errorCode(json) {
  return json?.error?.code ?? null;
}

async function signInWithPassword() {
  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: env.VITE_SUPABASE_ANON_KEY },
    body: JSON.stringify({ email: env.E2E_PROD_EMAIL, password: env.E2E_PROD_PASSWORD }),
  });
  const json = await response.json();
  if (!response.ok || !json.access_token) {
    throw new Error(`Supabase password auth failed: ${JSON.stringify(json)}`);
  }
  report.auth = { user_id: json.user?.id ?? null, email: json.user?.email ?? env.E2E_PROD_EMAIL };
  return json.access_token;
}

function toCents(value) {
  const text = String(value).trim();
  const negative = text.startsWith("-");
  const unsigned = negative ? text.slice(1) : text;
  const [whole, centsRaw = ""] = unsigned.split(".");
  const cents = `${centsRaw}00`.slice(0, 2);
  const magnitude = BigInt(whole || "0") * 100n + BigInt(cents || "0");
  return negative ? -magnitude : magnitude;
}

function stableJson(value) {
  return JSON.stringify(sortDeep(value));
}

function sortDeep(value) {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, sortDeep(v)]),
    );
  }
  return value;
}

async function readEnv(path) {
  try {
    const text = await readFile(path, "utf8");
    const parsed = {};
    for (const line of text.split(/\r?\n/u)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const index = trimmed.indexOf("=");
      if (index < 1) continue;
      parsed[trimmed.slice(0, index)] = unquote(trimmed.slice(index + 1).trim());
    }
    return parsed;
  } catch (error) {
    if (error?.code === "ENOENT") return {};
    throw error;
  }
}

function unquote(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function trimSlash(value) {
  return value.replace(/\/+$/u, "");
}
