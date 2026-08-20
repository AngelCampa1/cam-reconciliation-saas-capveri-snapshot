-- Align the legacy subscription_plan enum with the canonical workflow package
-- ids used throughout the app (reconcile / control / defend / enterprise).
--
-- Background: the workflow package id is recorded in subscriptions.tier (a free
-- text column added in 20260429022000). The legacy `plan` enum predates the
-- workflow-tier rename and only ever received the pricing-restructure values
-- (essentials, professional, growth, growth_v2, portfolio, enterprise). Several
-- callers (and E2E seeding) write the canonical workflow id directly into the
-- legacy `plan` column for broad entitlement fallback, so the enum must accept
-- those ids. `enterprise` already exists; add the remaining workflow tiers.
--
-- ALTER TYPE ... ADD VALUE cannot run inside a transaction block in older
-- Postgres, so each statement is guarded with IF NOT EXISTS and left
-- standalone. These are additive and safe to re-run.

ALTER TYPE subscription_plan ADD VALUE IF NOT EXISTS 'reconcile';
ALTER TYPE subscription_plan ADD VALUE IF NOT EXISTS 'control';
ALTER TYPE subscription_plan ADD VALUE IF NOT EXISTS 'defend';
