# One reconciliation, end to end

[PRD.md](./PRD.md) explains what CAM reconciliation is and shows the interface. This document
does the other thing: it follows a single reconciliation from the login screen to the tenant's
statement, and at every step names the code that does the work.

Every screenshot is the local stack running against the seeded development database. Re-capture them
with `node frontend/scripts/portfolio-screenshots.mjs` while Supabase, the Worker on port 8001, and
the SPA on port 5174 are up. Nothing here is a mockup, and where the seed data produces an empty
state or a blocked button, that is what you see.

(One edit was made to the raw output. The login shot is captured at 2880 pixels wide and its gradient
compresses badly, producing a 1.7 MB file that the repository's own large-file pre-commit hook
rejects. It was resized to 1920 and re-encoded. Nothing in the frame changed.)

---

## 1. Sign in

![CapVeri login: a split screen with product claims on the left and an email and password form on the right](./screenshots/00-login.png)

`LoginPage` is [`frontend/src/pages/auth/LoginPage.tsx:43`](../frontend/src/pages/auth/LoginPage.tsx#L43),
routed at [`App.tsx:341`](../frontend/src/App.tsx#L341).

The interesting half is on the server. Supabase issues the JWT, but the Worker does not believe what
is in it. [`middleware/auth.ts:73`](../cloudflare-backend/src/middleware/auth.ts#L73) verifies the
signature and then calls `resolveUserContext`, which re-reads `role`, `organization_id`, and
`is_platform_admin` straight out of the `users` table by `sub` on every single request
([`adapters/db/postgres.ts:301`](../cloudflare-backend/src/adapters/db/postgres.ts#L301)). A user
whose role is `tenant` gets a second read against `tenant_users` at line 322.

That is one database round trip per request, spent to make a forged claim inert. The reasoning is in
[SECURITY.md](./SECURITY.md).

## 2. Import the general ledger

![Upload General Ledger screen: a property selector, guidance on what a spreadsheet is and where to find it, and a drag-and-drop area that stays disabled until a property is chosen](./screenshots/06-documents.png)

This is where the anti-integration position becomes a screen. There is no Yardi connection to
configure. The user exports the report their property-management system already produces and drops
the file here.

Read the copy in that panel closely, because it is doing real work. It explains what a spreadsheet
is, lists the systems the file probably came from, and tells the user to check their Downloads
folder. The intended reader is a property accountant under year-end deadline, not a developer. Note
also that the drop zone is inert until a property is selected, and says so in plain words rather
than failing after the upload.

- Page: [`pages/ingestion/IngestionPage.tsx:254`](../frontend/src/pages/ingestion/IngestionPage.tsx#L254)
- Route: [`http/ingestion-routes.ts:65`](../cloudflare-backend/src/http/ingestion-routes.ts#L65)
- Parser: [`domain/ingestion/csv-parser.ts:390`](../cloudflare-backend/src/domain/ingestion/csv-parser.ts#L390),
  `parseAmount`, with currency cleanup at line 438
- Lands in: `import_batches`
  ([`adapters/db/ingestion.ts:179`](../cloudflare-backend/src/adapters/db/ingestion.ts#L179)) and
  `gl_entries` (line 789)

## 3. Map GL accounts to expense pools

A general ledger has hundreds of account codes. A lease recovers against a handful of expense pools.
Somebody has to say which accounts feed which pool, and the mapping is per property.

Mappings are patterns, not literals, so `5100-*` can catch an entire family of janitorial accounts.
The matcher is
[`domain/reconciliation/calculator.ts:1703`](../cloudflare-backend/src/domain/reconciliation/calculator.ts#L1703),
called during the calculation at line 525.

- Page: [`pages/pools/PoolsPage.tsx:74`](../frontend/src/pages/pools/PoolsPage.tsx#L74)
- Route: [`http/pool-config-routes.ts:260`](../cloudflare-backend/src/http/pool-config-routes.ts#L260)
- Table: `pool_mappings`, column `gl_account_pattern`

A pool with no mappings is the failure that produces the amber warning in step 7. Its expenses reach
nobody, and the totals still look plausible.

## 4. Extract the lease terms

![Document extractions list, each document with a confidence score](./screenshots/07-extractions.png)

The lease PDF goes up, and a model reads the CAM clauses out of it: the pro-rata share, the cap
structure, the base year, the administrative fee, the exclusions.

- Upload page: [`pages/leases/LeaseUploadPage.tsx:123`](../frontend/src/pages/leases/LeaseUploadPage.tsx#L123)
- List page: [`pages/extractions/ExtractionsPage.tsx:413`](../frontend/src/pages/extractions/ExtractionsPage.tsx#L413)
- Enqueue: [`http/document-extraction-routes.ts:389`](../cloudflare-backend/src/http/document-extraction-routes.ts#L389),
  onto the `capveri-extraction` queue
- Consumer: [`queues/consumers.ts:47`](../cloudflare-backend/src/queues/consumers.ts#L47)
- Two independent extractions plus a judge:
  [`domain/extraction/dual-extraction.ts:92`](../cloudflare-backend/src/domain/extraction/dual-extraction.ts#L92)
- Result lands in `documents.extraction_result`
  ([`adapters/db/extraction-jobs.ts:144`](../cloudflare-backend/src/adapters/db/extraction-jobs.ts#L144))

`documents.extraction_result` is a quarantine. Model output stops there. See
[AI-PIPELINE.md](./AI-PIPELINE.md).

## 5. A human clears the quarantine

![Extraction review: the source PDF pane failed to load, Approve and Commit is disabled, and the reason is printed under the button](./screenshots/10-extraction-review.png)

This is the most important screenshot in this document, and what makes it worth reading is that it
is showing a refusal.

**Approve & Commit is disabled**, and the reason sits under the button: *"Load the source PDF before
you approve."* The local seed has no stored PDF blob, so the left pane could not render the document,
so the gate closed. Nobody staged that. It is
[`VerificationPage.tsx:244`](../frontend/src/pages/extractions/VerificationPage.tsx#L244):

```ts
const approveDisabled =
  (needsLeaseSelection && !selectedLeaseId) || pdfFailedToLoad
```

You cannot approve an extraction you are not being shown the evidence for. The right pane gives the
reviewer a confidence score per field, an explicit *"The AI didn't find a value"* on the field the
model could not read, and per-field confirmation with undo. Progress reads 0 of 7.

The promotion out of quarantine happens at
[`adapters/db/document-submissions.ts:664`](../cloudflare-backend/src/adapters/db/document-submissions.ts#L664),
which is the only place `leases.recovery_profile` is written from an extraction. It carries a second
guard at lines 639 to 659: approval is refused outright if any reconciliation snapshot for that lease
is already finalized. Terms cannot change under a statement that has been sent.

## 6. Run the reconciliation

![Reconciliations across the portfolio: two properties, both in draft, with tenant-billable totals of $34,722.13 and $12,002.85 against a headline of $46,724.98](./screenshots/04-reconciliations.png)

The wizard has four steps, named in
[`ReconciliationWorkflowStepper.tsx:16`](../frontend/src/features/reconciliation/components/ReconciliationWorkflowStepper.tsx#L16):
`upload`, `calculate`, `review`, `finalize`.

- Trigger: [`CalculateButton.tsx:97`](../frontend/src/features/reconciliation/components/CalculateButton.tsx#L97)
- Route: [`http/reconciliation-routes.ts:139`](../cloudflare-backend/src/http/reconciliation-routes.ts#L139)
- Engine: [`domain/reconciliation/calculator.ts:188`](../cloudflare-backend/src/domain/reconciliation/calculator.ts#L188),
  per tenant at line 1066
- Money: [`domain/reconciliation/money.ts:4`](../cloudflare-backend/src/domain/reconciliation/money.ts#L4)
  for `Money`, line 93 for `Rate`

Everything on that screen is integer cents in `BigInt` from the moment it leaves the parser. The
arithmetic and the reasons for it are in
[RECONCILIATION-ENGINE.md](./RECONCILIATION-ENGINE.md), and the second implementation that exists to
disagree with it is in [ORACLE.md](./ORACLE.md).

The two property totals on that screen sum to the headline exactly, which is the least a system like
this owes you and is still worth checking.

## 7. Review

![Downtown Tower 2024, at step 3 of 4, with an amber warning that an expense pool has no GL account mappings](./screenshots/20-reconciliation-detail.png)

Finalize is not reachable from here. Review comes first, and the amber banner is why: a check found
an expense pool with no GL account mappings, so its costs would reach no tenant. The number would
still have looked reasonable.

## 8. Show the work

![Calculation Breakdown drawer: four steps, each with its literal arithmetic, including 150000.00 * 1.0752688 = 161290.32 and 8064.52 - 7800.00 = 264.52](./screenshots/21-calculation-trace.png)

Every figure expands into the steps that produced it, with the arithmetic written out: the gross-up
at `150000.00 * 1.0752688 = 161290.32`, this tenant's share at `161290.32 * 0.05 = 8064.52`, the
base-year deduction at `8064.52 - 7800.00 = 264.52`.

This is what a landlord sends to a tenant who disputes a bill, which is also why the engine had to be
deterministic. A trace that cannot be reproduced exactly is worse than no trace.

- Drawer: [`CalculationTraceDrawer.tsx:43`](../frontend/src/features/reconciliation/components/CalculationTraceDrawer.tsx#L43)
- Built server-side: [`calculator.ts:343`](../cloudflare-backend/src/domain/reconciliation/calculator.ts#L343)
- Persisted with the snapshot:
  [`adapters/db/reconciliation.ts:1407`](../cloudflare-backend/src/adapters/db/reconciliation.ts#L1407)

The trace is stored, not recomputed on demand, alongside a checksum and the lease terms as they stood
at calculation time.

## 9. Finalize

Finalize is the point of no return, so it is defended three ways at once:

| Guard | Where |
|---|---|
| Advisory lock, per organization and property | [`financial-evidence-lock.ts:3`](../cloudflare-backend/src/adapters/db/financial-evidence-lock.ts#L3) |
| `select ... for update` on the snapshot row | [`adapters/db/reconciliation.ts:1168`](../cloudflare-backend/src/adapters/db/reconciliation.ts#L1168) |
| Compare-and-swap on `status = 'draft'` | [`adapters/db/reconciliation.ts:1527`](../cloudflare-backend/src/adapters/db/reconciliation.ts#L1527) |

The third is the one that actually decides it. The update carries `where ... and status = 'draft'`,
so if two finalize requests race, exactly one updates a row. The other updates nothing, and a null
result is turned into a conflict rather than a success at
[`reconciliation.ts:613`](../cloudflare-backend/src/adapters/db/reconciliation.ts#L613). One 200,
the rest 409.

- Route: [`http/reconciliation-routes.ts:306`](../cloudflare-backend/src/http/reconciliation-routes.ts#L306),
  batch variant at line 412

## 10. Send the statement

- Routes: [`http/exports-routes.ts:593`](../cloudflare-backend/src/http/exports-routes.ts#L593)
- PDF: [`domain/exports/property-pdf.ts:69`](../cloudflare-backend/src/domain/exports/property-pdf.ts#L69)
- Stored in R2: [`adapters/storage/reports.ts:32`](../cloudflare-backend/src/adapters/storage/reports.ts#L32)

Exports also go out as CSV and XLSX for the landlord's own ERP, which is where a spreadsheet turns
into an attack surface. A tenant name beginning with `=` is a formula when the recipient opens the
file. [`domain/exports/erp-formatters.ts:26`](../cloudflare-backend/src/domain/exports/erp-formatters.ts#L26)
prefixes an apostrophe to any cell starting with `= + - @`, tab, or carriage return. Two call sites
were deliberately left alone and annotated, for reasons in
[SECURITY.md](./SECURITY.md#untrusted-input-hardening).

## 11. The tenant's side of the same statement

The tenant logs into the same application and sees one lease, theirs.

- Page: [`features/tenant-portal/pages/TenantDashboard.tsx:88`](../frontend/src/features/tenant-portal/pages/TenantDashboard.tsx#L88)
- Route: [`http/tenant-portal-routes.ts:53`](../cloudflare-backend/src/http/tenant-portal-routes.ts#L53)
- Scoping: [`adapters/db/tenant-portal.ts:162`](../cloudflare-backend/src/adapters/db/tenant-portal.ts#L162)

Look at what that query filters on:

```sql
select lease_id from tenant_lease_links where tenant_user_id = $1
```

`tenant_user_id`, not `organization_id`. A tenant user's `organizationId` is the *landlord's*
organization id, so scoping a tenant route by organization scopes it to every tenant in the building.
Every tenant-facing query in that adapter is scoped by `tenant_user_id`, and routes are landlord-only
until they opt in. That default is at
[`middleware/auth.ts`](../cloudflare-backend/src/middleware/auth.ts), and it is the reason a
forgotten route returns 403 instead of leaking.

---

## What the rest of it looked like

The walkthrough above is the spine. These are the surrounding screens, including the ones the seed
data leaves empty.

![Landlord dashboard](./screenshots/01-dashboard.png)

![Portfolio overview with bill difference, NOI impact, and a cap-rate slider](./screenshots/02-portfolio.png)

The recovery difference restated as the two numbers a landlord's principal acts on: additional annual
NOI, and the implied change in building value. The cap rate is a slider because it is an assumption,
and assumptions belong to the user.

![Portfolio Pipeline filtered to 2026, showing an empty state: "No campaigns for 2026", with the explanation "Dispute campaigns appear here once you finalize a reconciliation. Run and finalize one to get started." and a Go to Reconciliations button](./screenshots/03-portfolio-pipeline.png)

![Year-over-Year Comparison, unfilled: a "Select a property" dropdown with nothing chosen, and a greyed-out Compare button](./screenshots/08-analysis.png)

**Both of those are empty states, and these are the only captures of those two screens that exist.**
No populated version was ever taken, and rather than describe the screens as if one had been, they
are shown as they came out of the capture run. The seed data has no finalized 2026 reconciliation and
no second year to compare against, so neither screen had anything to display.

What they do show is how the empty case was handled, which is the part worth looking at here. Each
names the specific condition that is unmet rather than showing a blank panel, and each offers the
action that would fix it. The `Compare` button stays disabled until a property is chosen, so the
screen cannot be asked a question it has no data to answer.

![The dashboard at a 390-pixel viewport](./screenshots/30-dashboard-mobile.png)

![CapVeri marketing home page](./screenshots/40-marketing-home.png)

A separate Next.js application on its own Worker, with an SEO architecture large enough to have its
own document: [SEO.md](./SEO.md). The promotional banner is a fixed-deadline offer that expired
before the sunset. It renders because this is the site as it stood.
