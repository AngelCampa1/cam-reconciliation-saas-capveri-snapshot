# Goal: Portfolio-public — promote `portfolio/` to the repo root

> Make the engineering write-ups the first thing a reviewer sees in the GitHub file listing,
> without scrolling and without opening `docs/`. Move `docs/portfolio/` to `portfolio/` with
> `git mv` so history follows, fix every inbound link, and close this repo's real weakness:
> a README that embedded exactly one image while carrying thirteen captured screenshots.
>
> This repo is the reference case for the wider portfolio restructure — other repos copy this
> layout. The bar is therefore "correct enough to be copied", not "good enough to ship".
>
> Prior sweep `docs/goal-pristine-ux/` = product UI/UX quality. This track = the public
> presentation layer only. No application source, tests, or migrations are in scope.

## Method

1. Inventory every inbound reference to `docs/portfolio/` across markdown, config, and scripts
   before moving anything. A broken link after the move is worse than not moving the directory.
2. `git mv docs/portfolio portfolio` so file history follows the rename.
3. Rewrite relative links *inside* the moved documents. Depth changed by one level, so both
   classes of link break: `../../` (repo root) and `../` (siblings inside `docs/`).
4. Re-point the three README surfacing points: repository-map fence, `## Documentation` table,
   inline `→` callouts.
5. Verify every relative link resolves against the filesystem, mechanically, not by eye.
6. Judge each image by opening it, not by filename. Reject error states, empty states, and any
   shot carrying another product's branding. Caption only what the image actually shows.
7. Hygiene pass: committed tooling output, local absolute paths, stale cross-project references.

## Cycle log

### Cycle 1 — 2026-08-13 — Inventory

- Counted inbound references before touching anything: five files outside `docs/portfolio/`
  referenced it — `README.md` (the bulk), `docs/DEVELOPMENT.md`, `.pre-commit-config.yaml`, and
  the two `portfolio-screenshots.mjs` capture scripts under `frontend/` and `marketing/`.
- Counted relative links *inside* the portfolio documents: 137 of the form `(../../` pointing at
  the repo root, and 11 of the form `(../` pointing at siblings inside `docs/`. Both classes
  would break on a one-level move. This was the main risk in the whole task.
- Confirmed `portfolio/runs/` (4 raw test-output logs) is cited as evidence by `TESTING.md` and
  the README, and is excluded from two `pre-commit` hooks on purpose. It moves with the
  directory and is not treated as deletable tooling output.

### Cycle 2 — 2026-08-13 — Move and relink

- `git mv docs/portfolio portfolio`. Git recorded all 20 entries as renames (`R`), so history
  follows.
- Rewrote the 148 internal relative links with a three-pass substitution through a placeholder,
  so that the `../../` → `../` rewrite could not collide with the `../` → `../docs/` rewrite.
- Updated the five external referrers, including the `OUT` path constant in both screenshot
  capture scripts. `PRODUCT.md` names those scripts as the way to reproduce the gallery, so a
  stale path there would have made a documented reproduction command wrong.
- Verified mechanically: parsed every relative markdown link out of the README, `DEVELOPMENT.md`,
  and all 14 portfolio documents, and resolved each against the filesystem. 16 files checked,
  **0 broken**. Confirmed no `docs/portfolio` path survives in any document, config, or script;
  the only remaining occurrences of that string are the historical references in this ledger.

### Cycle 3 — 2026-08-13 — Images

- Opened all thirteen captured screenshots rather than trusting filenames, plus the two
  "possibly reusable" candidates from the sibling product's repository.
- README went from one embedded image to three. The existing hero (the calculation trace) was
  already the strongest image in the repository and was left in place.
- Put one previously unused screenshot to work in `PRODUCT.md`, where it makes a claim the
  document had only asserted in prose visible on screen.

### Cycle 4 — 2026-08-13 — Hygiene

- Searched for committed build and tooling output (`lint-output`, `typecheck-*`, `test_output`,
  `test_results_*`, `build-output`, `audit_results.json`, `coverage/`, `*.log`): **none present.**
  Nothing to delete. `portfolio/runs/` is deliberate evidence and stays.
- Searched for local absolute paths and stale cross-project references. Findings logged below.
- `docs/goal-*/` (25 directories at this level) are working ledgers and the owner's established
  convention. They stay, untouched.

### Cycle 5 — 2026-08-13 — Second-reviewer pass

Two independent reviewers went over the repository. Their findings were re-verified here rather
than accepted, and one of the three image findings did not survive that check.

- **`docs/getting-badges/` is now framed as what it is.** PP-05 was flagged and left unfixed in
  cycle 3 as out of scope. It is fixed now, and the fix is not deletion. A launch plan that was
  written in full and never executed is evidence of the work; removing it would be hiding a
  failure. The folder keeps every file and every line of submission copy. What changed is that a
  dated header on its README states plainly that nothing was ever submitted, that no profile was
  ever created, and that the product never launched — and each individual false claim inside the
  folder is corrected in place next to the claim it corrects.
- **Verified the domain rather than repeating the reviewer's word for it.** `capveri.com` is
  registered and delegated to Cloudflare nameservers but publishes no address record;
  `www.capveri.com` and `app.capveri.com` return NXDOMAIN. The pack had been presenting those two
  hosts as canonical live URLs. They are now labelled as planned addresses that never resolved,
  which also turns three platform eligibility assessments from "good fit" into recorded failures:
  SaaSHub and BetaList both require a working site, and G2 rejects inaccessible websites.
- **Opened the two named submission screenshots.** Both show the retired predecessor brand, not
  this product. One is that product's landing page with revenue and ROI figures rendered into the
  pixels; the other is a calculator feature this product never shipped. Every line that told a
  reader to upload either one now says what the file actually is. The references stay so the
  mistake stays legible, and the surrounding text now makes it impossible to read those baked-in
  figures as results. There was never a paying customer.
- **Reversed one reviewer finding on the evidence.** See PP-10.
- **README hero.** Moved to the top of the page, above the badges and the scale line, instead of
  sitting below several paragraphs of prose. Embeds went from three to nine, each with alt text
  written from the image itself.

### Cycle 6 — 2026-08-14 — Local absolute path sweep

Full-repo sweep for the author's local absolute build paths (`C:\Users\...` and `D:\code\...`,
both slash directions). This is an accuracy/polish defect, not a credential leak or personal
exposure — the account name in these paths is already the owner's public GitHub identity.

- `CLAUDE.md` / `AGENTS.MD`: the one absolute sibling-repository reference was already replaced
  with neutral wording ("a shared internal package repository") before this cycle started.
- `portfolio/runs/*.txt` (the reviewer-facing evidence logs — worst placement of the four):
  191 occurrences across `backend-pytest.txt` (121), `frontend-vitest.txt` (67),
  `marketing-vitest.txt` (1), and `cloudflare-backend-vitest.txt` (1). Normalized to `<repo>` /
  `<site-packages>` placeholders and added an honest one-line header to each file stating what
  was normalized. Verified byte-for-byte against the pre-edit originals with the path
  substitution reversed: identical — no test name, count, timing, or outcome changed.
- `scripts/oneoff/*.py` (6 files) and `marketing/content/linkedin/*.py` (5 files): hardcoded
  absolute paths replaced with paths derived from each script's own location
  (`Path(__file__).resolve()...`), not just scrubbed text. `scripts/oneoff/runner.py` also had
  literal backspace/tab control characters corrupting its hardcoded path (pre-existing damage,
  unrelated to this sweep) — fixed as part of rewriting the path derivation. All edited scripts
  compile clean (`python -m py_compile`).
- Three Node scripts hardcoded absolute paths into node_modules or a sibling checkout:
  `cloudflare-backend/scripts/local-ai-cs-roundtrip-e2e.mjs`, `frontend/scripts/prod-stress-jwt-lifecycle-scenario.mjs`,
  `docs/goal-pristine-2026/shoot.cjs`. Replaced with paths resolved relative to the script's own
  location (or a relative import specifier). All three pass `node --check`.
- Docs residue (`docs/architecture/third-party-dependency-map.md`, `docs/handoffs/`,
  `docs/goal-*/LEDGER.md` and `HANDOFF.md`, `docs/superpowers/specs|plans/`, `docs/guides/`,
  `docs/seo/`, `docs/archive/`, `docs/audits/`, `docs/analytics/`,
  `backend/tests/README_E2E.md`, `backend/tests/E2E_CONVERSION_SUMMARY.md`): 16 files, paths
  scrubbed to neutral placeholders (`<repo-root>`, `<claude-home>`) or bare sibling-repo names
  (dropping the `D:/code/` prefix, matching the precedent already set by `CLAUDE.md`). Prose and
  document structure left untouched — these are preserved working residue, not rewritten.
- Checked every hit against the "test fixture / guard input" exclusion before editing: none of
  the matched files are test or guard code (`rg` for path-leak-detection tests and guards found
  none referencing these strings). Nothing was skipped on that basis.
- First-pass re-scan (Windows-style patterns only) after the above: **zero** remaining matches.

### Cycle 6b — 2026-08-14 — Git-bash/WSL notation and private-repo-name leak

The first pass only matched `C:\...`/`D:\...` (and forward-slash variants) notation. It missed
git-bash / WSL style paths (`/c/Users/...`, `/d/code/...`, `/mnt/c/...`). Re-swept with those
patterns added.

- `scripts/oneoff/write_retention_files.py:2` — a `BASE` constant holding an absolute local path,
  an unused variable (never referenced anywhere else in the file). Removed rather than
  rewritten — dead code, and the file it belongs to does not compile on its own (pre-existing
  literal control-character corruption inside a string literal, unrelated to this sweep and
  outside the scope of a path-scrub).
- Higher-priority finding: `docs/goal-e2e-stress/HANDOFF.md:77` and
  `docs/goal-pristine-2026/LEDGER.md:31` both used an absolute sibling path as a working directory
  in shell commands — a git-bash-style path naming the private repository this snapshot was
  exported from, not just an anonymous local build path. Rewritten to `<repo-root>/...`.
  `HANDOFF.md:81` also carried a Claude Code project-memory identifier
  (`projects/D--code-camaudit/memory/...`) that is a literal serialization of that same absolute
  path; rewritten to `projects/<repo-project-id>/memory/...`. No prose or document structure
  changed beyond the path text itself.
- Swept the whole repo for bare `camaudit` (case-insensitive), separately from the path
  patterns, to check for other forms of the same leak. Found only: (a) `camaudit-v2` and
  `camaudit_frontend` — the sibling private repo and Vercel project, referenced by bare name in
  prose throughout multiple docs (not path notation; left as-is, same treatment as `sequencer`/
  `ventora-platform` elsewhere in this repo), and (b) `camaudit.io`/`CAMAudit`/`CamAudit*` —
  the product's former public brand, which is explicitly not in scope. Two ambiguous hits left
  untouched and reported rather than guessed at: `supabase_db_camaudit` (a local Docker
  container name in `docs/goal-pristine-2026/LEDGER.md:12`) and a local Supabase project label
  in `docs/goal-frontend-audit/PROGRESS.md:423` — both are dev-tooling naming residue derived
  from whatever the local checkout folder happened to be called, not a stable path reference to
  the private repo.
- Full re-scan, all five patterns, exit codes checked (0 = matched, 1 = clean):
  `C:\Users\...` → 0 real hits (exit 1; two illustrative examples remain in this ledger's own
  prose, see below), `D:\code\...` → 0 real hits (exit 1; three illustrative examples in this
  ledger), `/mnt/[cd]/Users/...` → exit 1 (was already clean), `/c/Users/...` → exit 1 (was 1
  file, now 0), `/d/code/...` → exit 1 (was 2 files, now 0).

### Cycle 7 — 2026-08-14 — Markdown link audit

Ran a dedicated link checker (four-way classification: real `MISSING`, root-relative links that
are web routes, root-relative links inside docs that GitHub would render broken, and
encoding/placeholder false positives) across every `.md`/`.mdx` file. Before: 71 real `MISSING`
links (104 raw hits, 33 of which are vendored `.claude/skills/**/SKILL.md` content whose
companion files were never part of this repo — left untouched, out of scope) plus 22
`ROOT-REL-IN-DOC` hits. After this cycle: **0 MISSING**, 22 `ROOT-REL-IN-DOC` (reviewed and kept,
see below).

- **Root cause, 33 links:** every story file under `docs/stories/epic-02/` and `docs/stories/epic-06/`
  linked its epic overview as `../_overview.md` — one directory level too high. `_overview.md` is
  a sibling file in the same folder as the stories, confirmed by `story-06.16`, the one story that
  already had it right (`./_overview.md`). One consistent retarget across all 33 files fixed the
  whole cluster.
- **`docs/README.md`, 16 links:** pointed at `./portfolio/...`, but `portfolio/` sits at the repo
  root, not under `docs/`. Retargeted to `../portfolio/...`. `portfolio/` itself has no broken
  links.
- **`docs/guides/01-infrastructure/*.md` and `docs/guides/02-deployment/*.md`, 15 links:**
  cross-references used the pre-restructure folder names (`../deployment/`, `../infrastructure/`)
  instead of the current numbered names (`../02-deployment/`, `../01-infrastructure/`).
  Retargeted; one further link in this pair of folders (an OAuth setup guide) was off by an
  extra directory level and fixed separately.
- **5 one-off links, fixed individually:**
  - `docs/archive/MANUAL_TESTING_SETUP_COMPLETE.md` — wrong relative depth to
    `docs/MANUAL_TESTING_GUIDE.md`; corrected.
  - `docs/guides/backend-testing.md` — two defects: a fixtures README two directories away
    referenced with only one `../`, and a `CLAUDE.md` reference with the same wrong depth plus a
    stale anchor (a TDD heading that no longer exists in `CLAUDE.md`); repointed to the closest
    live equivalent section.
  - `docs/guides/story-workflow.md` — linked a parallelization plan at the wrong path; it lives
    in `docs/archive/`, not `docs/`.
  - `docs/stories/_epic-index.md` — two adjacent links. One had an unencoded space in the target
    filename; it only "worked" locally because Windows filesystems are case-insensitive, and
    would not have resolved on GitHub. Percent-encoded to match the convention already used
    elsewhere in this repo. The other pointed at a PRD document that does not exist anywhere in
    the repo — link removed, list item kept.
  - `docs/feature-inventory/product-marketing-context.md` — linked an internal
    `docs/business/canonical-gtm-source-of-truth.md` that never existed in this repo. The sentence
    was rewritten to point at "the source order below" (which the same file already lists),
    instead of promising a document the reader cannot open.
- **`ROOT-REL-IN-DOC`, 22 links, reviewed and left as-is:** all 22 live in `docs/content/*.md`
  (marketing copy: `boma-2024-summary.md`, `cam-presend-checklist.md`, `deterministic-vs-ai-cam.md`,
  `gl-coding-guide.md`, `harris-county-gross-up.md`, `sb-1103-compliance.md`,
  `tenant-auditor-guide.md`, `vs-yardi.md`) and use root-relative paths like `/auth/register`,
  `/pricing`, `/tools/cam-leakage-estimator`, `/resources/what-is-cam-reconciliation` because that
  copy was written for the live site, where those are real routes, not file paths. Spot-checked
  each route pattern against `marketing/src/app/` and `frontend/src/pages/` in this snapshot and
  confirmed matching pages exist. Rewriting them as relative file links would misrepresent site
  routes as filesystem paths and be wrong in the opposite direction. Left unchanged.

## Findings registry

**P0 = broken/blocking · P1 = looks bad or confusing · P2 = polish**

| ID | Pri | Finding | State |
|---|---|---|---|
| PP-01 | P0 | 148 relative links inside the portfolio documents would break on the move — 137 root-relative (`../../`), 11 pointing into `docs/` siblings (`../`). | FIXED — three-pass rewrite; all links machine-verified to resolve. |
| PP-02 | P0 | Both `portfolio-screenshots.mjs` capture scripts wrote to a hardcoded `docs/portfolio/img` path. `PRODUCT.md` cites them as the reproduction command, so the move would have falsified a documented claim. | FIXED — `OUT` constant and header comment re-pointed. |
| PP-03 | P1 | README embedded exactly one image while the repository carried thirteen captured screenshots. The single highest-leverage surface was under-using its own strongest evidence. | FIXED — three embeds, each with descriptive alt text and a caption that matches what is on screen. |
| PP-04 | P1 | Two `pre-commit` hooks excluded `^docs/portfolio/runs/`. After the move the exclusion would no longer match, and the whitespace fixers would have rewritten the raw test logs — making the word "raw" in the adjacent comment a lie. | FIXED — both exclusions and the explanatory comment re-pointed. |
| PP-05 | P1 | `docs/getting-badges/assets-checklist.md` directs the reader to submit `assets/screenshots/landing.png` and `boma.png` as CapVeri's gallery images on Product Hunt, SaaSHub, and AlternativeTo. Both files are the *other* product's landing page — different wordmark, different palette, and carrying an unsubstantiated earnings claim and an ROI multiple. | FLAGGED, NOT FIXED — outside this track's scope (submission kit, not portfolio docs). Needs the owner. |
| PP-06 | P2 | Five committed Python scripts hardcode a local absolute user path. Two of them additionally point into a *sibling product's* checkout rather than this one. | FIXED — see Cycle 6. All `scripts/oneoff/*.py` and `marketing/content/linkedin/*.py` scripts now derive their paths from the script's own location instead of a hardcoded drive/username. |
| PP-07 | P2 | Three captured screenshots show empty or pre-input states, and one shows a red failure panel. | RESOLVED BY EXCLUSION — the empty states stay unreferenced; the failure panel is used only where the caption explains it as a gate working correctly. |
| PP-09 | P0 | `.gitignore` ignores numerically-prefixed PNGs tree-wide and rescued the gallery with a single negation pinned to the old path. After the move that negation stopped matching, so `portfolio/img/*.png` was ignored again. The committed files survived on their rename, but re-running the capture script would have produced images `git add` silently refused — breaking the "deliberate and reproducible" promise in the comment directly above the rule. | FIXED — negation re-pointed; verified with `git check-ignore` that neither the gallery nor `portfolio/runs/` is excluded. |
| PP-08 | — | Claimed on entry that `docs/getting-badges/` itself carried the off-brand earnings and ROI figures. | RETRACTED — searched the directory; those strings do not appear in it. The figures are in the two image files under `assets/screenshots/`, which that directory merely points at. Restated as PP-05. |
| PP-05 | P0 | *(reopened and closed)* `assets-checklist.md` and the pack README asserted "Screenshots show real CapVeri UI" and named two files as gallery images for four platforms. Both files are the predecessor brand, and one carries revenue/ROI figures that were never achieved. | FIXED — every claim corrected next to the reference; file references kept, not deleted. |
| PP-10 | P0 | The whole of `docs/getting-badges/` read as an active go-to-market plan: two dead hosts presented as canonical live URLs, "Use the live site with signup or trial access", "Once the profile is live, claim it" — against a README that says the product is sunset. | FIXED — dated header stating the plan was written and never executed; DNS verified; eligibility assessments that depended on a live site corrected to failures; instructions moved to the conditional. Submission copy inside the fenced blocks left verbatim as the artifact. |
| PP-11 | P1 | Reviewer called `portfolio/img/10-extraction-review.png` a broken error state undermining its caption in `PRODUCT.md`, and recommended replacing it. | REVERSED, IMAGE KEPT — opened it. `Approve & Commit` is disabled *because* the source PDF failed to load, with "Load the source PDF before you approve." printed beneath the button. The caption is about the human-review quarantine, and the image is that invariant holding in the exact case where verification is impossible. A successful-commit screenshot would show only the happy path. Caption and alt text sharpened to say this outright; image also promoted into the README. |
| PP-12 | P1 | `03-portfolio-pipeline.png` ("No campaigns for 2026") and `08-analysis.png` (unfilled Year-over-Year form, `Compare` disabled) are empty states embedded in `WALKTHROUGH.md`. | CAPTIONS REWRITTEN — a populated swap was preferred, but the repository holds 13 screenshots and no populated capture of either screen exists, so there was nothing to swap in. Text now states plainly that these are the only captures taken, and points at the handling of the empty case, which is what the shots actually evidence. |
| PP-13 | P1 | README's first image sat below the badges, the scale line, and several paragraphs; eight strong populated screenshots were unused. | FIXED — hero moved directly under the opening paragraph; nine images embedded with alt text written from the images. The calculation trace was re-confirmed as the hero by opening the alternatives: it is the only shot that evidences the repository's actual thesis, deterministic money math that shows its operands. |
| PP-14 | P2 | `METRICS.md` gave commands for its schema figures but omitted the ones for `CREATE FUNCTION`, `CREATE TRIGGER`, and `ENABLE ROW LEVEL SECURITY`, so a reader had to guess the regex to reproduce 66. | FIXED — all three commands added, plus a note on the two places where the obvious guess returns the wrong number: dropping `(or replace )?` from the function pattern returns 4 instead of 66, and adding it to the trigger pattern returns 47 instead of 46. |
| PP-15 | P1 | `portfolio/runs/*.txt` — the reviewer-facing raw test-run logs — carried 191 occurrences of the author's local absolute build paths (`C:\Users\...`, `D:\code\...`). Worst placement of any instance of this defect: directly in front of the reviewer. | FIXED — see Cycle 6. Normalized to `<repo>`/`<site-packages>` placeholders with an honest header line per file; verified byte-identical to the originals apart from the path text and the header. |
| PP-16 | P2 | 16 working docs (`docs/architecture/third-party-dependency-map.md`, `docs/handoffs/`, `docs/goal-*/LEDGER.md`/`HANDOFF.md`, `docs/superpowers/`, `docs/guides/`, `docs/seo/`, `docs/archive/`, `docs/audits/`, `docs/analytics/`, `backend/tests/README_E2E.md`, `backend/tests/E2E_CONVERSION_SUMMARY.md`) and 3 Node scripts (`cloudflare-backend/scripts/local-ai-cs-roundtrip-e2e.mjs`, `frontend/scripts/prod-stress-jwt-lifecycle-scenario.mjs`, `docs/goal-pristine-2026/shoot.cjs`) carried the author's local absolute paths in commands, cross-repo references, and hardcoded `node_modules` imports. | FIXED — see Cycle 6. Docs scrubbed to neutral placeholders without prose rewrites; scripts now resolve paths relative to their own location. |
| PP-17 | P1 | The first path sweep only matched `C:\...`/`D:\...` notation and missed git-bash/WSL-style paths. `docs/goal-e2e-stress/HANDOFF.md:77,81` and `docs/goal-pristine-2026/LEDGER.md:31` used an absolute sibling path that named, in path form, the private repository this snapshot was exported from, rather than just an anonymous local directory. `scripts/oneoff/write_retention_files.py:2` had the same notation for an unused variable. | FIXED — see Cycle 6b. Rewritten to `<repo-root>/...` (and `<repo-project-id>` for the one Claude-memory identifier); the dead variable was removed. Full re-sweep with git-bash patterns added confirms zero remaining hits. |
| PP-18 | P0 | 33 story files under `docs/stories/epic-02/` and `docs/stories/epic-06/` linked their epic overview one directory level too high (`../_overview.md` instead of `./_overview.md`), so every one of those links 404s. | FIXED — see Cycle 7. Single consistent retarget across all 33 files; root cause confirmed by the one story in the set that already had it right. |
| PP-19 | P1 | `docs/README.md` linked all 14 portfolio write-ups and the `portfolio/` index at `./portfolio/...`, but `portfolio/` sits at the repo root, not under `docs/`. 16 broken links from one doc. | FIXED — see Cycle 7. Retargeted to `../portfolio/...`. |
| PP-20 | P1 | `docs/guides/01-infrastructure/*.md` and `docs/guides/02-deployment/*.md` cross-reference each other using the pre-restructure folder names (`../deployment/`, `../infrastructure/`) instead of the current numbered folder names, plus one OAuth setup link off by an extra directory level. | FIXED — see Cycle 7. 16 links retargeted to the current folder names/depth. |
| PP-21 | P2 | 5 scattered broken links: a wrong relative depth in `docs/archive/MANUAL_TESTING_SETUP_COMPLETE.md`; a wrong depth plus a stale anchor in `docs/guides/backend-testing.md`; a wrong path in `docs/guides/story-workflow.md`; an unencoded-space link that only resolved locally on a case-insensitive filesystem plus a link to a PRD file that does not exist, both in `docs/stories/_epic-index.md`; and a link to an internal GTM source-of-truth doc that was never part of this repo, in `docs/feature-inventory/product-marketing-context.md`. | FIXED — see Cycle 7. Four retargeted; the PRD link removed (target never existed anywhere in the repo); the GTM-doc sentence rewritten to stop promising an unreachable file. |
| PP-22 | — | 22 root-relative links (`/auth/register`, `/pricing`, `/tools/...`, `/resources/...`) across 8 files in `docs/content/`, flagged by the checker because GitHub resolves a leading `/` against the repo root. | REVIEWED, LEFT AS-IS — see Cycle 7. This is marketing copy written for the live site; the routes are real and spot-verified against `marketing/src/app/` and `frontend/src/pages/` in this snapshot. Not a defect. |

## Notes for the owner

- `PP-05` is closed. The checklist no longer instructs anyone to publish the off-brand material,
  and the pack no longer reads as pending work. Two decisions inside that fix are yours to
  overturn if you disagree. First, the folder was kept whole rather than deleted, on the view that
  a fully-written plan that was never executed is evidence and deleting it would be concealment.
  Second, the submission copy inside the fenced blocks was left verbatim, including its
  `capveri.com` URLs, because that copy is the artifact; only the instructions around it were
  moved into the conditional.
- `PP-11` is a reviewer finding this pass reversed rather than actioned. If you want the
  extraction-review screenshot replaced anyway, the replacement does not exist in the tree and
  would need a fresh capture against a seed that stores a PDF blob.
- `PP-12` is the one weakness left. Two screens in `WALKTHROUGH.md` are represented only by empty
  states, because only empty captures were ever taken. The honest caption is in place, but a
  populated capture of the Portfolio Pipeline and the Year-over-Year comparison would be a real
  improvement and needs the local stack seeded with a finalized reconciliation and a second year.
- `PP-06` is now closed (Cycle 6). The Python one-off scripts derive their paths from the
  script's own location. `scripts/oneoff/write_wh.py` and `scripts/oneoff/runner.py` still
  depend on a scratch content file that was never checked into the repo (a one-time staging
  artifact, discarded after use) — the destination path is now correct, but the script cannot
  run for anyone else without that missing input. That is pre-existing script residue, not a
  path-scrubbing gap.
- The repository-map fence lists `portfolio/` last, matching the existing ordering by code
  importance. Moving it to the top was considered and rejected: the `## Documentation` table
  directly beneath is the real index, and leading the map with the write-ups reads as promotion
  to exactly the skeptical reader this page is written for.
- `PP-21`'s `CLAUDE.md` anchor fix is a judgment call, not a verified one: `#critical-rules` is
  the closest live section to what the old TDD heading covered, but it is not a like-for-like
  replacement — worth a glance if testing-standards content later moves again.
- `PP-22` is a review decision, not a fix. If you disagree that route-shaped links belong in
  `docs/content/`, the correct change is not per-link edits but a decision on whether that
  marketing-source content should live under `docs/` at all, since every file in it uses this
  pattern throughout.

### Cycle 8 — align with the cross-portfolio `PORTFOLIO-STANDARD.md`

A later pass, run against the house-wide spec that now governs all fifteen `*-snapshot` repos
(heading text and order, `portfolio/` filename casing, alert syntax, image location, wrap column).
This repo's README and `portfolio/` were checked against that spec and brought into line.

| ID | Pri | Finding | State |
|---|---|---|---|
| PP-23 | P0 | README lacked several headings the cross-repo spec requires (`Contents`, `Screenshots`, `Built with AI agents`, `Known gaps`), had two required headings in the wrong relative order (`Architecture` before `What it did`), and used a hand-bolded blockquote instead of `[!IMPORTANT]`/`[!NOTE]` alert syntax for the status disclosure and the byline/license teaser. | FIXED — README restructured to the required heading set and order; status and byline/license converted to GitHub alert syntax; a `Contents` list and a new `Screenshots` grid (all 13 captures, with the two empty-state ones named as such) and `Known gaps` section added; `Built with AI agents` promoted from a nested subsection into its own top-level heading. |
| PP-24 | P1 | `portfolio/` had no index file, which the spec requires for every repo. | FIXED — `portfolio/README.md` added: a checkability statement, a table of all 14 files with one-line summaries and lengths, and a `portfolio/` vs `docs/` boundary paragraph. |
| PP-25 | P2 | `portfolio/PRODUCT.md` used a filename the spec's naming-resolution table maps to `PRD.md`. | FIXED — file renamed and all inbound references (`README.md`, `docs/README.md`, `portfolio/WALKTHROUGH.md`) updated, including visible link text. |
| PP-26 | P1 | `portfolio/img/` used a directory name the spec standardizes to `portfolio/screenshots/` across the whole portfolio. | FIXED — directory renamed; every markdown reference in `README.md`, `portfolio/PRODUCT.md`/`PRD.md`, `portfolio/WALKTHROUGH.md`, and `docs/getting-badges/assets-checklist.md` updated. Both capture scripts (`frontend/scripts/portfolio-screenshots.mjs`, `marketing/scripts/portfolio-screenshots.mjs`) and the `.gitignore` negation rule that protects the gallery from the numeric-prefix ignore pattern were re-pointed at the new path — the same class of defect `PP-02`/`PP-09` caught on the previous move, this time from the generator side rather than after the fact. |
| PP-27 | P2 | 11 code fences across `README.md` and `portfolio/*.md` (arithmetic, filenames, a regex, a shell snippet, an ASCII diagram, a SQL comment header) opened without a language tag. | FIXED — all 11 tagged (`text`, `bash`, or `sql` as appropriate). |
| PP-28 | P2 | Two top-level planning documents (`docs/Architecture for CapVeri.md`, `docs/Data Architecture for CapVeri.md`) and two working docs (`docs/architecture/system-architecture.md`, `docs/architecture/reconciliation-architecture.md`) cover the same ground as `portfolio/ARCHITECTURE.md` with no indication which is current. | NOTED, NOT DELETED — a short notice was added to the top of each of the four pointing at the authoritative `portfolio/` document; the working copies stay in place because the owner values them as history. |
| PP-29 | — | Renaming `PRODUCT.md` broke a same-file anchor: `portfolio/METRICS.md` linked to `../README.md#how-this-was-built`, a heading that no longer exists as a standalone subsection after the README restructure folded it into `## Built with AI agents`. | FIXED — retargeted to `../README.md#built-with-ai-agents`. Found by a full anchor-resolution sweep of every markdown-to-markdown link in the repo, run specifically because the img-to-screenshots move and the README restructure both touch a lot of link surface at once. |
| PP-30 | — | Checked `docs/` for the backup files, empty directories, and raw dumps this pass was asked to prune. | NONE FOUND. The 26 `goal-*` directories and the 17 loose top-level files are, on inspection, working artifacts with real content (findings, patches, URL lists, scripts) rather than junk — consistent with this repo's own prior note that the disorganization here is a naming-convention problem, not a litter problem. Nothing was deleted. |
| PP-31 | — | Checked whether `D:\code\camaudit-v2` (named as this product's private source repo for this pass) held any usable CapVeri-branded screenshots to harvest. | NOT DONE, FLAGGED FOR THE OWNER — `camaudit-v2`'s own `docs/decisions/2026-07-27-consolidate-tenant-into-camaudit-v2.md` states in writing that `camaudit-v2` is the CAMAudit/LeaseAudit codebase, a *different, unrelated* product to CapVeri ("`D:\code\camaudit` (CapVeri) is a *different* product... It is not part of this decision"), and its screenshots are of that other product's UI. Nothing was copied from it. This is a discrepancy in the task briefing worth the owner's attention, not a decision made unilaterally in either direction. |

### Cycle 9 — finish the `portfolio/` alert-syntax rollout (spec §3.2)

Cycle 8 (PP-23) converted `README.md`'s status and byline/license blockquotes to GitHub alert
syntax but never carried the same conversion into `portfolio/`, where nine documents still used
plain `>` blockquotes for note- and warning-caliber asides. This pass applied judgment per
blockquote rather than converting everything — real quotations, epigraphs, and quoted source
excerpts were left as plain blockquotes, since an alert box around a quoted sentence misrepresents
whose words they are.

| ID | Pri | Finding | State |
|---|---|---|---|
| PP-32 | P2 | `portfolio/RECONCILIATION-ENGINE.md`'s `cumulative-cap.ts` header-comment blockquote is a genuine correctness hazard: two cap-bank functions that look interchangeable diverge on a specific input sequence, and the note exists to stop a reader from reusing the wrong one. | FIXED — converted to `> [!WARNING]`. |
| PP-33 | P2 | Nine informational/caveat blockquotes across `portfolio/AI-PIPELINE.md` (1), `portfolio/METRICS.md` (6), `portfolio/SECURITY.md` (1), `portfolio/ORACLE.md` (1), `portfolio/SCHEMA-HISTORY.md` (1), `portfolio/ENGINEERING-LOG.md` (1), and `portfolio/INFRASTRUCTURE.md` (1) were plain blockquotes despite being scope corrections, "not claimed" disclaimers, or methodology notes — the exact `[!NOTE]` use case the spec names. | FIXED — all 11 converted to `> [!NOTE]`. |
| PP-34 | — | Four blockquotes were left as plain `>`, deliberately not converted: `AI-PIPELINE.md`'s system-prompt delimiter excerpt (a literal quotation of the prompt text, not editorial commentary); `ORACLE.md`'s "matching the oracle is NOT automatically correct" passage (explicitly introduced as a quotation from `docs/goal-e2e-stress/HANDOFF.md`, and the surrounding prose frames it as such — "The discipline is written down... and it cuts both ways:"); and `SCHEMA-HISTORY.md`'s excerpt of migration `20260701000000`'s own header comment (introduced by "opens by naming the exact line it is fixing:"). Boxing a quoted sentence in an alert would misattribute it as this document's own voice rather than the source's. | LEFT AS-IS, by design. |
| PP-35 | — | Re-verified `portfolio/README.md`'s document index against `wc -l` on every file in `portfolio/` after the alert-syntax edits (each `[!TAG]` insertion adds one line). | FIXED — 8 length figures drifted by the edits (`METRICS.md` 345→351, `ENGINEERING-LOG.md` 398→399, `SECURITY.md` 208→209, `ORACLE.md` 186→187, `RECONCILIATION-ENGINE.md` 212→213, `AI-PIPELINE.md` 180→181, `SCHEMA-HISTORY.md` 192→193, `INFRASTRUCTURE.md` 213→214); index table updated to match. |
| PP-36 | — | Ran a full relative-link and `#anchor` resolution sweep over every file touched this cycle plus `portfolio/README.md`. | ALL RESOLVE. No broken file links or heading anchors introduced; `#L<n>` GitHub source-line links (not heading anchors) were excluded from the anchor check, since they resolve against the linked file's line count, not its headings. |

### Cycle 10 — disclose the CAMAudit → CapVeri rename to a reader

No reader-facing document anywhere in this repo told a reader that CapVeri was formerly branded
CAMAudit — checked the README and every file in `portfolio/` for "formerly", "renamed",
"previously known", "was called", "former brand": zero matches, despite `portfolio/INFRASTRUCTURE.md`
naming `camaudit_frontend`, `camaudit-marketing`, and `api.camaudit.io` throughout, and
`docs/migration/README.md` documenting the rebrand in detail.

| ID | Pri | Finding | State |
|---|---|---|---|
| PP-37 | P0 | Nothing in this repo's reader-facing docs states that `camaudit.io` / `camaudit_frontend` / other `camaudit`-prefixed identifiers in `portfolio/INFRASTRUCTURE.md` and elsewhere refer to this same product under its former name, CAMAudit. A reader who lands on `README.md` first (the entry point) has no way to know this. | FIXED — added one sentence to `README.md`, immediately after the opening pitch paragraph and before the status alert: "CapVeri was formerly branded CAMAudit; `camaudit.io`, `camaudit_frontend`, and other `camaudit`-prefixed identifiers throughout this repository ... refer to this same product under its old name," linking to `portfolio/INFRASTRUCTURE.md` and `docs/migration/README.md`. No rename date is stated — `docs/migration/README.md` documents the rebrand but does not date it, and `portfolio/INFRASTRUCTURE.md`'s 12/13 June 2026 dates are for the Railway/Vercel-to-Cloudflare infrastructure migration, not confirmed as the same date as the brand rename, so no date was asserted here. |
| PP-38 | — | Cross-checked `PP-31` (Cycle 8): `camaudit-v2` is a separate, unrelated repo (the CAMAudit/LeaseAudit codebase per its own decision doc), not this product's former name. The new disclosure sentence names only the identifiers actually found inside this repo (`camaudit.io`, `camaudit_frontend`) and does not mention `camaudit-v2`, to avoid re-introducing that conflation. | CONFIRMED, no change needed beyond the PP-37 wording itself. |
| PP-39 | — | Recomputed every length cell in `portfolio/README.md`'s index table with `wc -l` after this cycle's edit (`README.md` is not itself indexed there, and no `portfolio/*.md` file was touched this cycle). | UNCHANGED — all 14 rows still match `wc -l` exactly. |
| PP-40 | — | Ran a relative-link and `#anchor` resolution sweep over `README.md` after the PP-37 edit. | ALL RESOLVE — the two new links (`./portfolio/INFRASTRUCTURE.md`, `./docs/migration/README.md`) point at real files; no anchors were added. |

### Cycle 11 — corpus-wide index column order (`PORTFOLIO-STANDARD.md` §2.5)

The cross-repo standard fixed `portfolio/README.md`'s index table column order as link, length,
summary — length second, not last. This repo already had `Document | Covers | Length`, length
last.

| ID | Pri | Finding | State |
|---|---|---|---|
| PP-41 | P2 | `portfolio/README.md`'s index table had length as the third (rightmost) column, the position the standard now says a 375px viewport pushes off-screen first. | FIXED — reordered to `Document \| Length \| Covers`; all 14 rows and the alignment row updated, no cell content changed. |
| PP-42 | — | Recomputed every length cell against `wc -l` after the column-order edit. | UNCHANGED — all 14 rows still match `wc -l` exactly; the edit only moved columns, it did not touch cell values. |
| PP-43 | — | Ran a relative-link and `#anchor` resolution sweep over `README.md` and every `portfolio/*.md` file. | ALL RESOLVE — no links or anchors were touched this cycle. |
