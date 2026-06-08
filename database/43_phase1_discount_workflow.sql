-- Migration 43: Add discount columns to invoices for proper discount workflow
ALTER TABLE ems.invoices
ADD COLUMN IF NOT EXISTS discount_id BIGINT,
ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS final_amount NUMERIC(12,2);

-- Update existing invoices: final_amount = amount (default to original amount)
UPDATE ems.invoices SET final_amount = amount WHERE final_amount IS NULL;

-- Notify PostgREST
NOTIFY pgrst, 'reload schema';
