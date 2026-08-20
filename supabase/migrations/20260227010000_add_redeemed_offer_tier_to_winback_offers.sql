-- Track which winback offer tier was redeemed so a second token is blocked at checkout.
-- Queries filter by organization_id (PK), so no additional index is needed.
ALTER TABLE public.free_audit_winback_offers
    ADD COLUMN redeemed_offer_tier TEXT,
    ADD COLUMN redeemed_at TIMESTAMPTZ;
