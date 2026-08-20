-- Add accrual_date to GL entries for accrual-basis filtering
-- Cash basis: filter by transaction_date (payment date)
-- Accrual basis: filter by COALESCE(accrual_date, transaction_date) (invoice/service date)
ALTER TABLE public.gl_entries ADD COLUMN accrual_date date;

-- Index for accrual-basis queries (partial: only rows that have an accrual_date)
CREATE INDEX idx_gl_entries_accrual_date ON public.gl_entries(property_id, accrual_date)
  WHERE accrual_date IS NOT NULL;

COMMENT ON COLUMN public.gl_entries.accrual_date IS
  'Invoice/service date for accrual-basis filtering. Falls back to transaction_date when NULL.';
