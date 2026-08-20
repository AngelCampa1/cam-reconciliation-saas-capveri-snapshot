-- Add money-back guarantee tracking columns to subscriptions table.
-- money_back_claimed_at: when the refund was claimed (NULL = not claimed)
-- money_back_refund_id:  Stripe refund ID (rf_xxx) for auditability

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS money_back_claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS money_back_refund_id text;
