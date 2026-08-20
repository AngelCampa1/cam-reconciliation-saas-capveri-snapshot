#!/usr/bin/env node
/**
 * Agent 5B — PROD E2E stress: AI EXTRACTION PIPELINE correctness & safety invariants.
 *
 * Scope (disjoint from 5A file-parsing / 5C post-import):
 *   1. HUMAN-VERIFICATION GATE — extractions never auto-committed to canonical
 *      leases without the human approve step / proper authz.
 *   2. ZDR / privacy — every OpenRouter LLM call sends the zero-data-retention
 *      provider opt-out.
 *   3. Judge / dual-extract robustness — disagreements never crash / silently
 *      pick wrong (safe trust_neither).
 *   4. Truncation — documents over EXTRACTION_MAX_DOCUMENT_CHARS (100000) truncate
 *      safely, no crash, no silent loss.
 *   5. Malformed LLM output — invalid/partial/empty/off-schema handled without
 *      crashing the queue consumer or dropping the job.
 *
 * COST: designed for ~$0 real LLM spend. The ZDR / judge / truncation / malformed
 * proofs run the REAL production source (imported from cloudflare-backend/src) with
 * a spy `fetch` — no network, no OpenRouter tokens. The only live prod calls are
 * authz/pre-LLM-guard probes that return before any model is invoked.
 *
 * Run from frontend/:  npx tsx scripts/prod-stress-extraction-pipeline-scenario.mjs
 *
 * MUST run under tsx (not bare `node`): Parts A-D dynamically import REAL
 * cloudflare-backend/src/**\/*.ts files, which use TS constructor parameter
 * properties (`constructor(private readonly x: T)`). Node's built-in
 * type-stripping (unflagged or --experimental-strip-types) only erases types
 * syntactically and cannot handle parameter properties (which require real
 * transformation, emitting `this.x = x` field assignments) -- it throws
 * ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX. tsx performs a full esbuild-based
 * transform and handles this correctly. `npx tsx` resolves to
 * frontend/node_modules/.bin/tsx (already installed).
 */

import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import process from "node:process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, "..", "..");
const BE = resolve(REPO, "cloudflare-backend", "src");

// Windows: Node's ESM loader requires file:// URLs for absolute dynamic
// import() targets -- a bare drive path (D:\...) throws
// ERR_UNSUPPORTED_ESM_URL_SCHEME. Wrap every BE-relative source path through
// this helper instead of calling resolve(BE, ...) directly.
const beImport = (...segments) => pathToFileURL(resolve(BE, ...segments)).href;

const results = [];
const rec = (name, pass, detail) => {
  results.push({ name, pass: !!pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
};

// ---------------------------------------------------------------------------
// Load prod creds (best-effort; live probes skip if absent)
// ---------------------------------------------------------------------------
function loadEnv(path) {
  try {
    const txt = readFileSync(path, "utf8");
    const out = {};
    for (const line of txt.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
    return out;
  } catch {
    return {};
  }
}
const envLocal = loadEnv(resolve(REPO, ".env.local"));
const feProd = loadEnv(resolve(REPO, "frontend", ".env.production.local"));
const API = (envLocal.E2E_PROD_API_URL || "https://api.capveri.com").replace(/\/$/, "");
const SUPA_URL = feProd.VITE_SUPABASE_URL;
const SUPA_ANON = feProd.VITE_SUPABASE_ANON_KEY;

// ===========================================================================
// PART A — ZDR / privacy invariant (real source, spy fetch, $0)
// ===========================================================================
async function partA_zdr() {
  const { OpenRouterClient, DEFAULT_OPENROUTER_PROVIDER_CONFIG } = await import(
    beImport("adapters", "ai", "openrouter.ts")
  );

  // A spy fetcher that records the outbound payload and returns a canned,
  // schema-valid response so no real network / tokens are used.
  const captured = [];
  const spyFetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    captured.push(body);
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: '{"ok": true}' } }],
        usage: { total_tokens: 1 },
        model: body.model,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  const client = new OpenRouterClient("test-key", spyFetch);

  const hasZdr = (p) =>
    p && p.provider && p.provider.zdr === true;
  const hasAllowlist = (p) =>
    p && p.provider && Array.isArray(p.provider.only) && p.provider.only.length > 0;

  // Positive controls: the four extraction-family methods must carry ZDR.
  captured.length = 0;
  await client.extractText({
    prompt: "p", model: "m", documentText: "d",
  });
  rec("A1 extractText sends provider.zdr=true", hasZdr(captured[0]),
    JSON.stringify(captured[0]?.provider ?? null));

  captured.length = 0;
  await client.extractPdf({
    prompt: "p", model: "m", pdfBytes: new Uint8Array([1, 2, 3]), filename: "x.pdf",
  });
  rec("A2 extractPdf sends provider.zdr=true (used by extractor/gap-filler/validation-reprompt)",
    hasZdr(captured[0]), JSON.stringify(captured[0]?.provider ?? null));

  captured.length = 0;
  await client.requestJson({ content: "c", model: "m" });
  rec("A3 requestJson sends provider.zdr=true (used by judge)",
    hasZdr(captured[0]), JSON.stringify(captured[0]?.provider ?? null));

  captured.length = 0;
  await client.chat({
    model: "m",
    messages: [{ role: "user", content: "c" }],
    provider: DEFAULT_OPENROUTER_PROVIDER_CONFIG,
  });
  rec("A4 chat WITH provider (gl-narrative pattern) sends provider.zdr=true",
    hasZdr(captured[0]), JSON.stringify(captured[0]?.provider ?? null));

  // NEGATIVE / DEFECT PROBE: the cross-doc orchestrator calls chat() with NO
  // provider block. Drive the REAL orchestrator source and inspect the payload.
  const { runCrossDocAnalysis } = await import(
    beImport("domain", "cross-doc-analysis", "orchestrator.ts")
  );

  // Minimal repository stub: satisfies assemble + persist, returns a shape the
  // orchestrator accepts. It must report a verified lease so we reach the LLM call.
  const fakeRepo = {
    assembleCrossDocInput: async () => ({
      property: { id: "p", name: "Prop", period_year: 2024 },
      data_availability: { has_verified_leases: true },
      leases: [],
      pools: [],
    }),
    persistCrossDocResult: async (r) => ({ ...r, id: "cd-1" }),
  };
  const modelRoute = { model: "z-ai/glm-5.1", fallbackModels: [] };

  captured.length = 0;
  try {
    await runCrossDocAnalysis(fakeRepo, client, modelRoute, {
      propertyId: "p", periodYear: 2024, organizationId: "o",
    });
  } catch {
    // Parsing/persist may throw depending on stub; we only care that the
    // OpenRouter payload was captured before any throw.
  }
  const cd = captured[0];
  const cdSent = !!cd;
  const cdHasZdr = hasZdr(cd);
  const cdHasAllowlist = hasAllowlist(cd);
  // NOTE: this was originally written as a defect-probe (cross-doc's chat()
  // call was missing provider.zdr). Re-verified against the current source
  // (domain/cross-doc-analysis/orchestrator.ts) -- the fix already landed
  // (imports DEFAULT_OPENROUTER_PROVIDER_CONFIG, passes `provider:
  // DEFAULT_OPENROUTER_PROVIDER_CONFIG` in the chat() call). This check now
  // asserts the FIX holds, not the original defect.
  rec(
    "A5 cross-doc chat SENDS provider.zdr=true + non-empty allowlist (fix verified present)",
    cdSent && cdHasZdr && cdHasAllowlist,
    cdSent
      ? `provider=${JSON.stringify(cd.provider ?? null)}`
      : "no payload captured (orchestrator threw before LLM call — inconclusive)",
  );
}

// ===========================================================================
// PART B — Judge / dual-extract robustness (real source, $0)
// ===========================================================================
async function partB_judge() {
  const dj = await import(beImport("adapters", "ai", "extraction-judge.ts"));
  const { OpenRouterExtractionJudge } = dj;

  const config = {
    judge: { model: "z-ai/glm-5.1", fallbackModels: [] },
  };

  // Conflicting values on a financial field + an ambiguous string field.
  const primary = { pro_rata_share: 0.05, cap_type: "cumulative", cam_pool_name: "CAM - Common Area" };
  const sibling = { pro_rata_share: 0.08, cap_type: "LESSER_OF", cam_pool_name: "Common Area Maintenance" };

  // B1: judge LLM throws → safe failed telemetry (trust_neither), no crash.
  const throwingClient = { requestJson: async () => { throw new Error("boom 500"); } };
  const j1 = await new OpenRouterExtractionJudge(throwingClient, config).judge(primary, sibling);
  const b1ok = Array.isArray(j1.verdicts) &&
    j1.verdicts.every((v) => v.verdict === "trust_neither");
  rec("B1 judge LLM failure → trust_neither telemetry, no throw", b1ok,
    `verdicts=${JSON.stringify(j1.verdicts.map((v) => v.verdict))}`);

  // B2: malformed judge JSON → safe failure, no crash.
  const garbageClient = { requestJson: async () => ({ content: "not json at all {{{", tokensUsed: 1, model: "m" }) };
  const j2 = await new OpenRouterExtractionJudge(garbageClient, config).judge(primary, sibling);
  const b2ok = j2.verdicts.some((v) => v.field === "_judge_error" || v.verdict === "trust_neither");
  rec("B2 judge malformed JSON → safe trust_neither, no throw", b2ok,
    `verdicts=${JSON.stringify(j2.verdicts)}`);

  // B3: empty verdicts array while disagreements exist → treated as failure.
  const emptyClient = { requestJson: async () => ({ content: '{"verdicts": []}', tokensUsed: 1, model: "m" }) };
  const j3 = await new OpenRouterExtractionJudge(emptyClient, config).judge(primary, sibling);
  const b3ok = j3.verdicts.every((v) => v.verdict === "trust_neither");
  rec("B3 judge empty-verdicts-with-disagreements → failure/trust_neither", b3ok,
    `verdicts=${JSON.stringify(j3.verdicts.map((v) => v.verdict))}`);

  // B4: unknown verdict enum coerced to trust_neither (conservative default).
  const weirdClient = { requestJson: async () => ({
    content: '{"verdicts":[{"field":"pro_rata_share","verdict":"maybe_lol","chosen_value":0.05}]}',
    tokensUsed: 1, model: "m" }) };
  const j4 = await new OpenRouterExtractionJudge(weirdClient, config).judge(primary, sibling);
  const b4ok = j4.verdicts.length > 0 && j4.verdicts[0].verdict === "trust_neither";
  rec("B4 judge unknown verdict enum → coerced trust_neither", b4ok,
    `verdicts=${JSON.stringify(j4.verdicts)}`);

  // B5: mergeExtractionStageResults — both extractors failed → throws (job
  // fails/retries), never silently commits an empty extraction.
  const de = await import(beImport("domain", "extraction", "dual-extraction.ts"));
  let threw = false;
  try {
    de.mergeExtractionStageResults(
      { ok: false, error: new Error("primary died"), model: "m", tokensUsed: 0, durationMs: 0 },
      { ok: false, error: new Error("sibling died"), model: "m", tokensUsed: 0, durationMs: 0 },
    );
  } catch (e) {
    threw = e instanceof Error && e.message === "primary died";
  }
  rec("B5 both extractors failed → merge throws (no silent empty commit)", threw);

  // B6: one extractor failed → merge returns the surviving extraction (degraded but safe).
  const m6 = de.mergeExtractionStageResults(
    { ok: true, json: { pro_rata_share: 0.05 }, model: "m", tokensUsed: 1, durationMs: 1 },
    { ok: false, error: new Error("sibling died"), model: "m", tokensUsed: 0, durationMs: 0 },
  );
  rec("B6 one extractor failed → returns surviving extraction, judge skipped",
    m6.merged && m6.merged.pro_rata_share === 0.05 && m6.telemetry.siblingFailed === true);
}

// ===========================================================================
// PART C — Truncation invariant (real source, $0)
// ===========================================================================
async function partC_truncation() {
  const { truncateDocument, buildDocumentTextContent, DOCUMENT_TRUNCATION_NOTICE } =
    await import(beImport("adapters", "ai", "openrouter.ts"));

  const MAX = 100_000;

  // C1: over-limit text truncates and appends the notice (no crash, no loss-without-signal).
  const big = "x".repeat(MAX + 50_000);
  const t1 = truncateDocument(big, MAX);
  rec("C1 over-limit doc truncated + notice appended",
    t1.length < big.length && t1.endsWith(DOCUMENT_TRUNCATION_NOTICE),
    `in=${big.length} out=${t1.length}`);

  // C2: under-limit passes through unchanged.
  const small = "hello world";
  rec("C2 under-limit doc unchanged", truncateDocument(small, MAX) === small);

  // C3: page-boundary preference — cut near a "--- PAGE " marker in last 20%.
  const pageDoc = "A".repeat(85_000) + "--- PAGE 42 ---\n" + "B".repeat(30_000);
  const t3 = truncateDocument(pageDoc, MAX);
  rec("C3 truncation prefers page boundary in last 20%",
    !t3.includes("--- PAGE 42 ---") || t3.indexOf("--- PAGE 42 ---") === -1,
    `notice=${t3.endsWith(DOCUMENT_TRUNCATION_NOTICE)}`);

  // C4: buildDocumentTextContent wraps + truncates; invalid maxChars falls back to 100000.
  const wrapped = buildDocumentTextContent("PROMPT", big, 0);
  rec("C4 buildDocumentTextContent invalid maxChars → 100000 fallback, wraps in <document_text>",
    wrapped.includes("<document_text>") && wrapped.includes(DOCUMENT_TRUNCATION_NOTICE));

  // C5: extreme input (5x limit) does not blow up.
  let c5ok = true;
  try { truncateDocument("z".repeat(MAX * 5), MAX); } catch { c5ok = false; }
  rec("C5 5x-limit input truncates without throwing", c5ok);
}

// ===========================================================================
// PART D — Malformed / partial / empty LLM output (real source, $0)
// ===========================================================================
async function partD_malformed() {
  const { parseExtractionJson } = await import(
    beImport("adapters", "ai", "native-pdf-extraction-pipeline.ts")
  );
  const { parseOpenRouterResponse, stripThinkingTags } = await import(
    beImport("adapters", "ai", "openrouter.ts")
  );

  const throwsOn = (fn) => { try { fn(); return false; } catch { return true; } };

  // D1: empty content → OpenRouterApiError (not silent success).
  rec("D1 empty model content → error (not silent)",
    throwsOn(() => parseOpenRouterResponse({ choices: [{ message: { content: "" } }] })));

  // D2: non-string content → error.
  rec("D2 non-string content → error",
    throwsOn(() => parseOpenRouterResponse({ choices: [{ message: { content: 42 } }] })));

  // D3: totally off-shape payload → error.
  rec("D3 off-shape payload → error",
    throwsOn(() => parseOpenRouterResponse({ garbage: true })));

  // D4: partial / non-JSON extraction text → parse error (fallback trigger, not crash-commit).
  rec("D4 non-JSON extraction text → throws parse error",
    throwsOn(() => parseExtractionJson("here is your data: pro_rata=5%")));

  // D5: JSON array (not object) → rejected as off-schema.
  rec("D5 JSON array (off-schema) → rejected",
    throwsOn(() => parseExtractionJson("[1,2,3]")));

  // D6: fenced valid JSON still parses (models often wrap in ```json).
  let d6 = null;
  try { d6 = parseExtractionJson('```json\n{"pro_rata_share":0.05}\n```'); } catch { /* */ }
  rec("D6 fenced valid JSON parses", d6 && d6.pro_rata_share === 0.05);

  // D7: <think>…</think> reasoning stripped before parse.
  rec("D7 <think> reasoning tags stripped",
    stripThinkingTags("<think>reasoning</think>{\"a\":1}") === '{"a":1}');
}

// ===========================================================================
// PART E — LIVE prod probes: human-verification gate + cross-doc pre-LLM guard
//          (authz / guard returns before any model call → $0 LLM spend)
// ===========================================================================
async function partE_liveGate() {
  if (!SUPA_URL || !SUPA_ANON || !envLocal.E2E_PROD_EMAIL) {
    rec("E* live prod probes SKIPPED (missing creds)", true, "no E2E_PROD creds / supabase env");
    return;
  }

  // Password grant → prod JWT.
  let token;
  try {
    const r = await fetch(`${SUPA_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPA_ANON },
      body: JSON.stringify({
        email: envLocal.E2E_PROD_EMAIL,
        password: envLocal.E2E_PROD_PASSWORD,
      }),
    });
    const j = await r.json();
    token = j.access_token;
  } catch (e) {
    rec("E auth grant", false, String(e));
    return;
  }
  if (!token) { rec("E auth grant", false, "no token"); return; }
  const authH = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  // E1: approve a non-existent document → must NOT create a lease; 404/400/403, never 200.
  const fakeDoc = "00000000-0000-0000-0000-0000000000ff";
  try {
    const r = await fetch(`${API}/api/v1/extractions/${fakeDoc}/approve`, {
      method: "PUT",
      headers: authH,
      body: JSON.stringify({ profile: { pro_rata_share: 0.99 }, edit_history: [] }),
    });
    rec("E1 approve non-existent doc → not 200 (no phantom canonical commit)",
      r.status !== 200, `status=${r.status}`);
  } catch (e) {
    rec("E1 approve non-existent doc", false, String(e));
  }

  // E2: cross-doc analysis on a random property → 404 (not found) or 422 (no verified
  //     leases) — both return BEFORE the LLM call, so $0 spend. Must never 200/201.
  const fakeProp = "00000000-0000-0000-0000-0000000000ee";
  try {
    const r = await fetch(`${API}/api/v1/properties/${fakeProp}/cross-doc-analysis`, {
      method: "POST",
      headers: authH,
      body: JSON.stringify({ period_year: 2024 }),
    });
    rec("E2 cross-doc on missing property → guarded pre-LLM (404/422/402/403), no 2xx",
      r.status >= 400 && r.status < 500, `status=${r.status}`);
  } catch (e) {
    rec("E2 cross-doc guard probe", false, String(e));
  }
}

// ===========================================================================
async function main() {
  console.log("=== Agent 5B — Extraction pipeline stress (est. LLM spend: ~$0) ===\n");
  try { await partA_zdr(); } catch (e) { rec("PART A crashed", false, String(e?.stack || e)); }
  console.log("");
  try { await partB_judge(); } catch (e) { rec("PART B crashed", false, String(e?.stack || e)); }
  console.log("");
  try { await partC_truncation(); } catch (e) { rec("PART C crashed", false, String(e?.stack || e)); }
  console.log("");
  try { await partD_malformed(); } catch (e) { rec("PART D crashed", false, String(e?.stack || e)); }
  console.log("");
  try { await partE_liveGate(); } catch (e) { rec("PART E crashed", false, String(e?.stack || e)); }

  const pass = results.filter((r) => r.pass).length;
  const fail = results.length - pass;
  console.log(`\n=== ${pass}/${results.length} checks passed, ${fail} failed ===`);
  // Note: A5 was originally written as a *defect probe* (cross-doc chat() call
  // missing provider.zdr). Re-verified against current source: the fix is
  // present. A5 "PASS" now means the ZDR fix holds, not that a defect exists.
  console.log("(A5 PASS = ZDR fix VERIFIED PRESENT on cross-doc path.)");
}

main();
