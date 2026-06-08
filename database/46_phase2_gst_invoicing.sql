-- ============================================================================
-- PHASE 2: GST INVOICING
-- Run AFTER: 45_phase2_due_menu_keys.sql
-- ============================================================================

BEGIN;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 1. Add GST columns to core.companies
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ALTER TABLE core.companies
  ADD COLUMN IF NOT EXISTS gstin VARCHAR(20),
  ADD COLUMN IF NOT EXISTS hsn_code VARCHAR(10) DEFAULT '9992',
  ADD COLUMN IF NOT EXISTS gst_rate DECIMAL(5,2) DEFAULT 18.00;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 2. Add GST columns to ems.invoices
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ALTER TABLE ems.invoices
  ADD COLUMN IF NOT EXISTS cgst_amount DECIMAL(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sgst_amount DECIMAL(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS igst_amount DECIMAL(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS taxable_amount DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS total_gst_amount DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS is_gst_invoice BOOLEAN DEFAULT FALSE;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3. Update DIPL company with sample GSTIN
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
UPDATE core.companies
SET gstin = '33AABCU9603R1ZX',
    hsn_code = '9992',
    gst_rate = 18.00
WHERE code = 'DIPL' AND (gstin IS NULL OR gstin = '');

COMMIT;

NOTIFY pgrst, 'reload schema';
