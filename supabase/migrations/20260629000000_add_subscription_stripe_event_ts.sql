-- Out-of-order Stripe webhook protection.
--
-- Stripe delivers webhook events at-least-once and WITHOUT ordering guarantees:
-- a stale `customer.subscription.updated` / `.deleted` / `invoice.payment_failed`
-- event can be redelivered AFTER a newer event that already advanced the
-- subscription. Without a high-water mark, a redelivered stale `past_due` /
-- `canceled` permanently downgrades a paying customer (lost revenue), and a
-- stale `active` resurrects a canceled subscription (access leak).
--
-- Record the Stripe `event.created` timestamp of the last event we applied so
-- the application layer can skip strictly-older events. Nullable + no default,
-- so this is a metadata-only ADD COLUMN (no table rewrite, no lock).

ALTER TABLE public.subscriptions
    ADD COLUMN IF NOT EXISTS stripe_event_ts timestamptz;

COMMENT ON COLUMN public.subscriptions.stripe_event_ts IS
    'Stripe event.created timestamp of the most recently applied subscription webhook event. Used to ignore out-of-order / redelivered stale events.';
