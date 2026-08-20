# What the migrations remember

[ARCHITECTURE.md](./ARCHITECTURE.md) counts 142 migrations and 63 tables. The count is the least
interesting thing about them.

`supabase/migrations/` is 11,277 lines of SQL that no one ever reorganised, so it still holds the
order in which the schema was got wrong and then got right. A quarter of the files exist only to
repair an earlier one. Five consecutive migrations attack the same bug from five different angles,
each named after the last attempt's failure. That is the document.

---

## Read the filenames sceptically

The set runs from `20240101000001_create_organizations.sql` to
`20260701000100_fix_users_update_recursion_and_audit_requests_scope.sql`, which looks like two and a
half years of schema work. It is not. **The first date is fabricated.**

Sixty-eight files, 48% of the set, are prefixed `20240101`, with a six-digit counter as the only real
ordering signal. Checking those filenames against the commits that introduced them:

| File | Filename says | Actually added |
|---|---|---|
| `20240101000001_create_organizations.sql` | 2024-01-01 | 2025-12-29 |
| `20240101000060_fix_rls_performance.sql` | 2024-01-01 | 2026-02-10 |
| `20240101000068_data_retention_policy.sql` | 2024-01-01 | 2026-02-23 |

So the whole `20240101` block spans 2025-12-29 to 2026-02-23, about two months of real work
flattened onto one invented calendar day. Sequence numbers 33 and 67 are missing, which is the
fingerprint of a renumbering pass. A verification report from 2025-12-30 records the reason: a test
suite found several migrations sharing the timestamp `20240101000001` and recommended renumbering
them.

At file 69 the convention changes for good. `20260223222130_create_content_leads_table.sql` is a real
`supabase migration new` timestamp, and from there filenames track their commits to the minute. The
last two files, both dated `20260701`, were committed on 2026-07-01.

If you want the real schema timeline, it is **2025-12-29 to 2026-07-01**, about six months. The
filenames will lie to you for the first half of it, and they are left as they are because renaming
applied migrations is worse than a misleading prefix.

## The arc

| Phase | Files | What happened |
|---|---|---|
| Foundation | `000001`-`000024` | Organizations, users, properties, units, leases, GL entries, expense pools, snapshots, audit log, billing, documents, tenant portal, disputes |
| Recursion firefighting | `000025`, `000030`-`000039` | Six migrations against one class of RLS bug |
| Trigger and search-path patches | `000040`-`000059` | Audit triggers, service-role gaps, Supabase linter findings, plus the AI extraction tables |
| The RLS performance rewrite | `000060` | 1,139 lines, 64 policies rewritten |
| Billing and pricing churn | `000061`-`000066`, `20260224`-`20260304` | Actual-billed amounts, Stripe webhook events, a pricing restructure, a billing model added and then removed |
| Real timestamps begin | `20260223222130` onward | |
| Extraction and analysis | `20260311`-`20260430` | Cross-document analysis, export history, audit pipeline events |
| Advisor-driven hardening | `20260506`, `20260522` (7 files) | Storage buckets, write privileges, RPC execute grants |
| The comparison engine | `20260601`-`20260603` | Comparison runs, pool breakdowns on snapshots, management fee |
| Production incident fixes | `20260630`, `20260701` (2 files) | The cross-tenant leak and the recursion regression |

## Six migrations, one bug

Row-level security was in the schema from the first migration, not retrofitted.
`20240101000001_create_organizations.sql` enables RLS and creates three policies. That is the right
instinct, and it walked straight into the trap that catches everyone doing this in Postgres for the
first time.

The helper `get_user_organization_id()` reads the `users` table. The `users` table has an RLS policy.
That policy calls `get_user_organization_id()`. Postgres returns error 42P17, infinite recursion.

Read the filenames in order:

```text
20240101000025_fix_users_rls_circular_dependency.sql
20240101000030_fix_leases_rls_circular_dependency.sql
20240101000031_fix_leases_rls_simpler.sql
20240101000032_fix_leases_rls_disable_row_security.sql
20240101000034_fix_leases_rls_use_set_config.sql
20240101000035_fix_get_user_org_id_bypass_rls.sql
```

Fix it for `users`. Hit it again on `leases`. Try simpler. Try disabling row security. Try
`set_config`. Finally fix the helper itself so it bypasses RLS at the source. Each filename is the
previous attempt's obituary, and the sequence is a debugging session that happens to be checked into
version control.

The answer that stuck is a `SECURITY DEFINER` function that does
`PERFORM set_config('row_security', 'off', true)` before it reads. Thirty-four migration files
reference `SECURITY DEFINER`, and by the end there are nine such helpers, all of them existing for
this one structural reason: **an RLS policy cannot safely read a table that has RLS.**

The proof that this is structural rather than a one-off is at the far end of the timeline. On
2026-07-01, `20260701000100` fixes the identical bug, reintroduced six weeks earlier by
`20260522000001`, which had added an inline `select is_platform_admin from users` inside a `WITH
CHECK` clause on the `users` table. Every self-service profile update returned 500. The fix was a new
`current_user_is_platform_admin()` helper following the pattern the schema had already established
back in January. Knowing the rule did not stop it being broken by someone writing a policy in a
hurry, which is the argument for the helper being the only permitted way to ask the question.

## The performance rewrite

`20240101000060_fix_rls_performance.sql` is the largest file in the set at 1,139 lines, and it
rewrites 64 policies in one pass. Its header states exactly what and why:

```sql
-- Issue: Supabase linter warnings for auth_rls_initplan and multiple_permissive_policies
-- - auth.uid() called directly is re-evaluated for each row
-- - (select auth.uid()) is evaluated once per query and cached
-- - Multiple permissive policies require evaluating ALL policies for EVERY row
-- - Single combined policy with OR is more efficient
```

Two changes, applied everywhere. Wrap `auth.uid()` in a scalar subselect so the planner hoists it out
of the per-row path. Then merge separate per-action policies into one policy with `OR`, because
Postgres evaluates every permissive policy on every row and does not stop at the first match.

Both are cheap once you know them and invisible until a table is large. Two smaller passes follow:
`20260227000002` applies the same treatment to tables added since, and `20260301000002` (426 lines)
adds explicit `TO authenticated` clauses to every policy that lacked one, so the `anon` role stops
being asked to evaluate policies it can never satisfy.

## A quarter of the schema is repair work

Thirty-six of 142 filenames contain `fix`, `guard`, `scope`, `restore`, or a removal. That is 25%,
and the honest reading is that it overstates the failure rate: the seven `guard_*` files from
2026-05-22 are proactive tightening rather than reactions to a specific defect. Netting those out
still leaves roughly one file in five whose only purpose is to correct an earlier one.

Two of them are the production security incidents written up in [SECURITY.md](./SECURITY.md), and
both are worth reading as SQL, because both explain themselves in the file. `20260701000000` opens
by naming the exact line it is fixing:

> The prior policy ("Audit log viewable by admins",
> `20240101000060_fix_rls_performance.sql:458`) gated SELECT only on `users.role IN ('owner','admin')`
> with NO organization scope.

A migration that cites the migration it is repairing, by file and line, is the cheapest possible form
of institutional memory. It costs one comment and it survives everyone who was there.

## Habits visible in the SQL

**Idempotent by default.** `DROP POLICY IF EXISTS` appears 229 times, which follows from a schema
where policies are constantly redefined. Every helper function is `CREATE OR REPLACE`.

**Almost nothing is ever destroyed.** One `DROP TABLE` in 142 files:
`20260615000000_drop_warranty_certificates.sql`, removing a feature added by
`20260224100002_create_warranty_certificates.sql` four months earlier. Column drops appear three
times, the largest being nine columns when the bounty-hunter billing model was abandoned.

**Failure direction is written down.** `20260701000000` states that audit rows with a null
`organization_id` become invisible to organization admins, calls that fail-closed, and says so in the
file rather than leaving the next reader to work out whether the disappearance was intended.

**Indexes were speculative.** 231 `CREATE INDEX` statements, and essentially all of them arrive with
their table under a comment like "Performance indexes for common queries." Not one migration cites a
slow query, an `EXPLAIN` plan, or an incident as its reason. Zero use `CONCURRENTLY`, so every one
takes a lock. At this system's traffic that never mattered, and both facts are what you would expect
of a schema designed ahead of load rather than under it.

## Money never moved

The interesting non-event. Money is `NUMERIC(14,2)` in `20240101000007_create_gl_entries.sql`, the
seventh migration, and it is still `NUMERIC(14,2)` in `20260601000100_create_comparison_runs.sql`,
one of the last. Twenty-three columns use that type. Rates use `NUMERIC(10,8)`. There is exactly one
`ALTER COLUMN ... TYPE` in the entire set, and it changes an enum, not a number.

No float ever reached a money column, so no migration exists to rescue one. The single exception is
deliberate: `unit_price_cents INTEGER` on the Stripe credit-pack table, integer cents because that is
the unit Stripe's API speaks in, and matching an external system's representation beats converting at
every call site.

There is a real seam worth naming. The database stores exact decimals, and the reconciliation engine
computes in `BigInt` integer cents ([RECONCILIATION-ENGINE.md](./RECONCILIATION-ENGINE.md)). Money
converts at the adapter boundary in both directions, which is a conversion that has to be exactly
right and never lossy. Keeping the column type fixed for six months is what made that boundary
something you could reason about once rather than re-derive every time the schema moved.

## How this was checked

There is no CI job that applies these migrations to a database. `.github/workflows/ci.yml` uses
`supabase/` only as a path filter deciding whether to run the backend suite.

What exists instead is static verification: `backend/tests/test_migration_verification.py`, 882
lines, asserting file structure, ordering, dependency declarations, idempotency, and safety rules
such as no `DROP DATABASE` or bare `TRUNCATE`. It reads the files. It does not run them. Alongside it
sit `test_rls_isolation.py` at 1,272 lines and `test_migrations.py` at 3,426 lines, the latter being
the largest single test file in the Python suite.

The real integration check was `supabase db reset`, run locally, applying all 142 migrations from
scratch and loading the seed in fifteen to twenty seconds. That is a good check and it ran on
developer machines, not in CI, which is the same gap described in [TESTING.md](./TESTING.md).

> [!NOTE]
> **Drift versus defects.** The record documents one local migration-history divergence, resolved
> with `supabase migration repair`. It documents no production schema drift incident. The two July
> security fixes above are a different thing from drift: they were found by probing the live
> database during stress testing ([PROD-STRESS-PROGRAM.md](./PROD-STRESS-PROGRAM.md)), not by a
> migration-history mismatch.
