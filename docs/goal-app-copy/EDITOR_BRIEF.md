# App Copy Polish — Sub-Agent Editor Brief

You are editing **user-facing copy** in the `frontend/` React app at `/Users/angel/Code/camaudit`.
Apply ALL of the passes below to every visible text string in your assigned files. Do not touch
marketing/ or backend/. Only edit reader-visible text — not code identifiers, prop names, test IDs,
log lines, or API field names.

## What counts as "user-facing copy"

Headings, body text, button labels, link text, form labels, placeholders, help text, tooltips,
toast messages, error messages, empty-state text, modal/dialog copy, badge labels, table headers,
aria-label / sr-only text that a screen reader speaks.

## The passes (apply all, in this order)

1. **Humanizer pass.** Remove AI tells: significance inflation ("testament", "pivotal",
   "seamless"), promotional fluff ("powerful", "robust", "effortless"), -ing filler, rule-of-three,
   negative parallelism ("not just X, it's Y"), tailing negations ("no guessing"), copula avoidance
   ("serves as" -> "is"), vague authority phrases, filler ("in order to" -> "to"), hedging, generic
   upbeat conclusions. Plain, direct, human.

2. **Third-grade reading level.** Short sentences (aim under 12 words). Common everyday words.
   Active voice. One idea per sentence. Define or avoid jargon. A 3rd grader should understand it.
   Keep necessary domain terms (CAM, GL, BOMA, reconciliation, pro-rata) but surround them with
   plain words so meaning is clear from context. Do NOT dumb down to the point of changing meaning.

3. **Source-verification pass.** Every factual or product claim must match the TRUTH SHEET below
   (and repo source). If a claim is NOT supported by the truth sheet and you cannot verify it in the
   repo, DO NOT invent support and DO NOT silently delete a load-bearing claim — soften it to
   something verifiable or leave it and add it to your "FLAGGED" report list. Never add a new claim.

4. **No-lie pass.** Remove or fix anything false, exaggerated, or unprovable: fake guarantees,
   invented stats/percentages, "bank-level security", "100% accurate", "instant", "saves X hours"
   unless the number is in the truth sheet or repo. Numbers a user computes in-app (their own
   results) are fine. When unsure whether a claim is true, flag it rather than assert it.

5. **Zero em-dashes pass.** Remove every em dash (—) and en dash used as punctuation (–) from copy
   AND from any code comment you touch. Rewrite with a period, comma, parentheses, or "to" for
   numeric ranges. Also convert curly quotes (" " ' ') to straight quotes in copy.

6. **Soul / clarity check.** Read it aloud. It should sound like a calm, competent human talking to
   a busy property manager. Not a robot, not a hype salesperson.

## Hard rules

- **Buttons are pills** is a design rule, not copy — ignore styling, only edit text.
- Do not change component logic, props, variable names, i18n keys, or test IDs.
- If a string is built from a variable (e.g. tier name), edit only the literal text around it.
- **Update co-located tests.** If you change a string that a `*.test.tsx`/`*.test.ts` file in your
  scope asserts on, update the test's expected string to match. Stay within your assigned files +
  their co-located tests.
- Do NOT edit `src/generated/*` (auto-generated). If copy there needs changing, FLAG it instead.
- Preserve meaning. When in doubt, simplify wording but keep the claim intact, or flag it.

## TRUTH SHEET (the only product facts you may rely on)

- Product: **CapVeri**, a CRE FinOps platform for commercial landlords and property managers.
- What it does: verifies CAM (Common Area Maintenance) reconciliation. It works from CSV, Excel,
  and lease PDF exports. It does NOT replace or integrate with the ERP (Yardi/MRI/RealPage). You
  import a file; there is no API integration. Say "works from a file you export" or "no integration
  needed", never the internal codename "Anti-Integration".
- Financial math is **deterministic Python** — never done by an LLM/AI. Do not claim AI does the
  math. AI is used only for lease data extraction and GL narrative analysis, and every AI
  extraction requires human review before it is used.
- Free trial: **30 days**, no credit card required, full access to plan features.
- Launch offer (if referenced): **80% off the first year**.
- Standards: workflows are **aligned with BOMA 2024** (also support 2017/2010). "Aligned with" /
  "supports", never "certified by".
- Security/privacy claims allowed: records are encrypted; logs do not store PII; API data is not
  stored or used for model training. Do NOT claim SOC 2, ISO, "bank-level", or any cert not listed.
- Money is always handled with exact decimal math (never rounded floats).
- Do NOT promise specific dollar savings, specific hours saved, or ROI numbers unless the user's own
  in-app result produces them. Generic "find what you over- or under-billed" framing is fine.
- Support/contact: founder/support email is angel.campa@capveri.com. Do not invent phone numbers,
  SLAs, or response-time promises.

## Output you must return

1. A list of files you edited, with a one-line note each.
2. A "FLAGGED" section: any claim you could not verify, any generated-file copy needing a change,
   any string you were unsure about. If nothing, say "FLAGGED: none".
3. Confirm: "Em-dashes remaining in my files: 0" (after verifying with a grep on your files).
