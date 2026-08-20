# Metrics and provenance

Every number quoted in the [README](../README.md) or any portfolio document has a row here,
with the command that produced it and what the command excludes. If a number is not in this file,
it should not appear anywhere else.

**Measured at:** the snapshot tree, 2026-08-07. Code frozen 2026-07-03; see
[§ Provenance](#provenance) for what the snapshot excludes and why.
**Platform:** Windows 11, 32-core, Node 22.17.1, Python 3.13.5.

---

## The file universe

Every count below draws from `git ls-files`, so anything gitignored (`node_modules/`, `.venv/`,
`dist/`, `.next/`, `.wrangler/`, `coverage/`) is excluded automatically. Lockfiles are filtered out
on top of that.

Nine files that the private history tracked are absent here. They match those ignore rules and were
only ever committed by accident: local Wrangler R2 emulator state, a Cloudflare request-metadata
cache, and a machine-local editor settings file.

```bash
git ls-files -z \
 | grep -zvE '(node_modules/|\.venv/|/dist/|/build/|\.next/|\.wrangler/|coverage/|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|poetry\.lock|uv\.lock)' \
 | xargs -0 wc -l | grep -v ' total$'
```

| Metric | Value |
|---|---|
| Tracked files | 5,383 |
| Files counted (tracked minus lockfiles) | 5,379 |

---

## Lines of code

### By language

Text files only. Binary files (`.png`, `.pdf`, `.jpg`, `.xlsx`) appear in the raw `wc` output and
are excluded from every total below.

| Language | Files | Lines |
|---|---:|---:|
| Python | 838 | 275,991 |
| TypeScript | 829 | 275,004 |
| TSX | 1,004 | 264,177 |
| Markdown | 1,640 | 219,558 |
| ESM scripts (`.mjs`) | 174 | 143,582 |
| JSON | 124 | 66,021 |
| MDX | 275 | 48,470 |
| SQL | 156 | 21,780 |
| CSV (fixtures) | 90 | 18,379 |
| HTM (lease fixtures) | 5 | 7,296 |

### Source vs test vs generated

This is the split the README leads with. Only `.ts`, `.tsx`, `.py`, `.mjs`, `.js`, `.jsx` are
considered. A file counts as **generated** if it sits under a `generated/` directory or is
`worker-configuration.d.ts` / `*.gen.ts`. Otherwise it counts as **test** if its path matches this
regex, and as **source** if it does not:

```text
\.test\.|\.spec\.|/test_|_test\.py$|(^|/)tests?/|(^|/)e2e/|(^|/)mocks/|conftest\.py$|/local-[^/]*-e2e\.mjs$|/prod-[^/]*\.mjs$
```

| Bucket | Files | Lines |
|---|---:|---:|
| Application source | 1,463 | **364,654** |
| Test and E2E harness | 1,381 | **534,150** |
| Codegen output (API clients, CF types) | 11 | 60,654 |

Test lines exceed source lines by **1.465 : 1**. The README quotes the two raw numbers rather than
the ratio.

> [!NOTE]
> **On the word "generated".** In that table it means deterministic codegen: an OpenAPI client, the
> Cloudflare `worker-configuration.d.ts`, files under a `generated/` directory. It does not mean
> "written by a model." Essentially all of this code was written by a model, application source
> included, so the useful distinction here is between output a tool regenerates from a schema and
> output a person reviewed line by line. See [how this was built](../README.md#built-with-ai-agents).

> [!NOTE]
> **Why the last two alternatives are in that regex, and a correction.** The 37 bespoke Worker
> harnesses (`cloudflare-backend/scripts/local-*-e2e.mjs`) and the 104 production stress scenarios
> (`frontend/scripts/prod-*.mjs`) are test code, but they live under `scripts/`, so a rule that only
> recognises an `e2e/` *directory* files them as source. An earlier draft of this document did
> exactly that and reported 441,195 source / 457,291 test, a ratio of 1.036 : 1. Those numbers were
> wrong: they counted roughly 170,000 lines of test harness as production source. The figures above
> are the corrected ones, and the regex is given literally so the classification can be checked
> rather than taken on trust.

---

## Tests

### Test cases defined

Counted from source, not from a run. These are the counts of test *declarations*; the number a
runner reports can be higher because `it.each` / `@pytest.mark.parametrize` expand at runtime.

```bash
# Python
grep -rhoE '^\s*(async )?def test_' backend/tests backend/app | wc -l
# Vitest
grep -rhoE '^\s*(it|test)(\.each|\.only|\.skip|\.concurrent)?\s*\(' <dir> --include=*.test.ts --include=*.test.tsx | wc -l
```

| Suite | Runner | Cases declared |
|---|---|---:|
| `backend/` | pytest | 7,407 |
| `frontend/` | Vitest | 6,653 |
| `cloudflare-backend/` | Vitest | 1,943 |
| `marketing/` | Vitest | 606 |
| **Total** | | **16,609** |

### Other test assets

| Asset | Count | Command |
|---|---:|---|
| Playwright spec files | 46 | `git ls-files \| grep -iE 'e2e\|playwright' \| grep -cE '\.(spec\|test)\.tsx?$'` |
| Bespoke local E2E harnesses | 37 | `git ls-files 'cloudflare-backend/scripts/local-*-e2e.mjs' \| wc -l` |
| Production scenario scripts | 104 | `git ls-files 'frontend/scripts/prod-*.mjs' \| wc -l` |
| Oracle parity suites (Hypothesis) | 21 | `git ls-files 'backend/tests/stress/*oracle*.py' \| wc -l` |

### Measured runs

Every suite was run to completion on 2026-08-07 against this tree, on Windows 11, Node
v22.17.1, Python 3.13. The counts below are what the runners printed, not what was declared.

| Suite | Command | Result | Wall clock | Exit |
|---|---|---|---:|---:|
| `backend/` | `pytest -n 12 --dist loadscope` | 7,407 passed · 21 skipped · 0 failed | 412 s | 0 |
| `frontend/` | `npm run test:coverage` | 6,665 passed · 441 files | 151 s | 0 |
| `cloudflare-backend/` | `npm run test` | 1,988 passed · 23 skipped · 127 files | 71 s | 0 |
| `marketing/` | `npm run test:coverage` | 698 passed · 101 files | 46 s | 1 |

The wall-clock column is the `ELAPSED=` line each log ends with: the whole command, including
interpreter startup, collection, and writing the coverage report. A runner's own timer is lower,
because it only counts the test phase. For `backend/` the two are **412 s wall clock** and
**379.06 s** on pytest's timer (`7407 passed, 21 skipped ... in 379.06s (0:06:19)`), and both lines
are in [`runs/backend-pytest.txt`](./runs/backend-pytest.txt). Prose elsewhere quotes the 6m19s
runner figure; this table quotes wall clock throughout.

**Total passing: 16,758.** This exceeds the 16,609 declared-case count above because
parameterized cases (`it.each`, `pytest.mark.parametrize`) count once in the source grep and once
per generated case at runtime.

### Test files

**Total: 1,115.** This one is assembled from two different methods, so it is worth spelling out.
The three Vitest suites print a file count and those are used directly. Pytest under `-n 12` prints
no file count, so `backend/` is counted from the tree instead.

| Suite | Count | Source |
|---|---:|---|
| `frontend/` | 441 | `Test Files 441 passed` in [`runs/frontend-vitest.txt`](./runs/frontend-vitest.txt) |
| `cloudflare-backend/` | 127 | `Test Files 127 passed` in [`runs/cloudflare-backend-vitest.txt`](./runs/cloudflare-backend-vitest.txt) |
| `marketing/` | 101 | `Test Files 101 passed` in [`runs/marketing-vitest.txt`](./runs/marketing-vitest.txt) |
| `backend/` | 446 | `git ls-files 'backend/**/test_*.py' 'backend/**/*_test.py' \| wc -l` |
| **Total** | **1,115** | |

The `backend/` figure is files on disk rather than files the runner reported. It is a fair stand-in
here because the run's 7,407 passing cases match the 7,407 `def test_` declarations exactly, so no
test file was skipped wholesale, but it is not the same kind of measurement as the other three.

A previous version of the README said **1,167** files. That number has no row here and could not be
reproduced from this tree by any method tried. It is corrected to 1,115 above.

**Coverage measured in the same runs:**

| Suite | Statements | Lines | Note |
|---|---:|---:|---|
| `backend/` | n/a | n/a | **95.51%** total, `--cov-fail-under=95` enforced in `pyproject.toml` and met |
| `frontend/` | 85.22% | 86.48% | v8 provider over all of `src/**/*.{ts,tsx}` |
| `cloudflare-backend/` | n/a | n/a | **Not obtainable.** Tests run inside `workerd` via `@cloudflare/vitest-pool-workers`, where the v8 coverage provider is not available. No number is claimed. |
| `marketing/` | 88.46% | n/a | **Scoped, and not quoted elsewhere.** `coverage.include` is a hand-curated allowlist of specific landing components, so the percentage describes those files, not the project. |

### The one non-zero exit

`marketing/` exited 1 with **all 698 tests passing**. The failure is the coverage gate, not a test:
the project configures a 95% global threshold and the run measured 88.46% statements, 87.95%
functions, 84.27% branches. This threshold was already unmet in the repository before any work in
this session; it is reported rather than lowered.

### Test fixes made to reach these results

Thirteen tests failed on the first pass. All thirteen were time-dependent or referenced paths the
snapshot excludes. None was a product defect. The fixes are listed in
[TESTING.md](./TESTING.md#fixing-three-time-dependent-tests), and the substance of them is: a
promotional offer with a
hard-coded `endsAt` of `2026-07-04T07:00:00Z` had expired, so tests asserting live-offer behaviour
had to pin the clock rather than read the wall clock.

Raw stdout for every run is kept in [`runs/`](./runs/).

---

## Database

All counts from `supabase/migrations/`, which is the only source of schema truth in the repo.

```bash
ls supabase/migrations/*.sql | wc -l
grep -rhoiE "create table +(if not exists +)?[a-z0-9_.\"]+" supabase/migrations/ \
  | sed -E 's/.*[[:space:]]//' | tr -d '"' | sed 's/^public\.//' | sort -u | wc -l
grep -rhoic "create policy" supabase/migrations/ | awk '{s+=$1} END{print s}'
grep -rhoiE "enable row level security" supabase/migrations/ | wc -l
grep -rhoiE "create (unique )?index" supabase/migrations/ | wc -l
grep -rhoiE "create (or replace )?function" supabase/migrations/ | wc -l
grep -rhoiE "create trigger" supabase/migrations/ | wc -l
cat supabase/migrations/*.sql | wc -l
```

The `(or replace )?` group in the function pattern is load-bearing: 62 of the 66 are
`CREATE OR REPLACE FUNCTION` and only 4 are bare `CREATE FUNCTION`, so dropping it returns 4.
The trigger pattern deliberately has no such group: `create (or replace )?trigger` returns 47,
one more than the 46 below, because a single migration uses `CREATE OR REPLACE TRIGGER`.

| Object | Count |
|---|---:|
| Migration files | 142 |
| Distinct tables | 63 |
| `CREATE POLICY` statements | 394 |
| `ENABLE ROW LEVEL SECURITY` statements | 83 |
| `CREATE INDEX` statements | 231 |
| `CREATE FUNCTION` statements | 66 |
| `CREATE TRIGGER` statements | 46 |
| Migration SQL lines | 11,277 |

> [!NOTE]
> **Caveat on the 394:** that is the count of `CREATE POLICY` *statements* across all migrations,
> not the number of policies live on the final schema. Migrations drop and recreate policies as the
> model evolved, so the live count is lower. The README labels this "394 RLS policy statements."

> [!NOTE]
> **Two figures on this table were wrong in an earlier draft and are corrected here.** The index
> count read 226, because the pattern was `create index` and so skipped all five
> `CREATE UNIQUE INDEX` statements. And "migration SQL lines" read 21,780, which is every `.sql`
> file in the repository across all 156 of them, not the 142 migrations. The migrations are 11,277
> lines. Both errors ran in the same direction as the language table above, where 21,780 is the
> correct figure for SQL as a language.

---

## Git history

```bash
git rev-list --count master
git rev-list --count --merges master
git log --format='%ad' --date=short | sort -u | wc -l
git log --shortstat --pretty=format: | awk '/insertion/{...}'
```

These come from the private development history described in [§ Provenance](#provenance), not from
this snapshot, which has a single commit.

Every figure below is measured through the last development commit, `773efa548` on 2026-07-03. The
documentation commits written afterwards, on 2026-08-07, are deliberately excluded: they produced
these pages, not the product, and folding them in would overstate how long the thing was built.

| Metric | Value |
|---|---:|
| Commits | 5,242 |
| Merge commits | 804 |
| First commit | 2025-12-24 |
| Last commit | 2026-07-03 |
| Distinct days with commits | 125 |
| Insertions / deletions | +2,364,371 / -519,106 |

These are the figures the README quotes.

Commits per month:

| Month | Commits |
|---|---:|
| 2025-12 | 155 |
| 2026-01 | 181 |
| 2026-02 | 666 |
| 2026-03 | 187 |
| 2026-04 | 329 |
| 2026-05 | 880 |
| 2026-06 | 2,722 |
| 2026-07 | 122 |
| 2026-08 | documentation only, excluded above |

Authors: `Angel Campa` 4,077 · `VentoraLabs` 1,132 · `AI Alex` 33. The latter two are automation
identities from the same operator, not additional people.

> [!NOTE]
> **What the churn number is not.** +2,364,371 insertions counts every line of every commit,
> including generated API clients, lockfiles, 219,558 lines of Markdown, and files rewritten many
> times. It is a measure of activity, not of code produced. The application source figure
> (364,654) is the one to reason about.

---

## Provenance

**This repository is a snapshot: one commit, holding the source tree as it stood at the code
freeze.** The development history it came from is 5,242 commits over 125 active days, and it stays
private, because it holds material that was never meant to be published alongside the engineering.
The commit statistics on this page are measured from that private history; everything else is
measured from the tree you are reading.

Excluded from the snapshot, and why:

| Excluded | Reason |
|---|---|
| `gtm/`, `docs/business/`, `docs/fundraising/`, `docs/Outreach research/`, `docs/gtm-tool-*/` | Personal details of people who never agreed to appear in a portfolio, and commercial material that is nobody's business |
| `youtube-production/`, `scratchpad/`, `marketing/content/linkedin/postiz-import.*` | Generated video frames, working scratch files, and scheduled social content. Weight without signal |
| Two mangled-path blobs holding test credentials | Credentials, even expired test ones |
| Agent configuration under `.agents/`, `.codex/`, `cowork-plugins/` | Duplicate harnesses for other tools, holding the same instructions as `.claude/` |

`.claude/` was **not** excluded. It ships whole, including all 62 skill folders under
`.claude/skills/`, and roughly half of those are marketing and growth-strategy skills
(`cold-email`, `paid-ads`, `pricing-strategy`, `launch-strategy`, `reddit-marketing`, and so on)
rather than engineering ones. This code was written by AI models working under direction, and the
instructions that directed them are part of the engineering record, so they stayed. An earlier
version of this table claimed these skills had been removed as duplicates of the GTM documents.
That was wrong, and the tree, not the claim, is what to check.

Infrastructure identifiers were replaced with `REDACTED_*` placeholders in 15 files: the production
Supabase project reference, PostHog project and dashboard IDs, and an Apple Team ID.

**Reading commit references.** Every SHA in these documents refers to the private development
history and will not resolve here. They are kept because they are what the working ledgers under
`docs/goal-*/` cite, so the two line up. Where a defect write-up in
[ENGINEERING-LOG.md](./ENGINEERING-LOG.md) or [SECURITY.md](./SECURITY.md) cites a commit, it also
cites the file and line where that code lives in this tree, which is the citation you can actually
check.
