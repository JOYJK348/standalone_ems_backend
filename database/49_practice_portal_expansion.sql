-- ============================================================================
-- Migration 49: Expand Practice Tables for Govt Portal Simulations
-- Adds detailed columns for all three portals to support full form data
-- ============================================================================

-- ========== GST Entries: Add new fields ==========
ALTER TABLE ems.practice_gst_entries 
    ADD COLUMN IF NOT EXISTS hsn_code TEXT,
    ADD COLUMN IF NOT EXISTS item_description TEXT,
    ADD COLUMN IF NOT EXISTS quantity INTEGER DEFAULT 1,
    ADD COLUMN IF NOT EXISTS unit_price NUMERIC(12,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS supply_state_code TEXT,
    ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- ========== TDS Entries: Expand schema ==========
ALTER TABLE ems.practice_tds_entries 
    ADD COLUMN IF NOT EXISTS deductor_tan TEXT,
    ADD COLUMN IF NOT EXISTS deductor_name TEXT,
    ADD COLUMN IF NOT EXISTS deductor_pan TEXT,
    ADD COLUMN IF NOT EXISTS deductee_address TEXT,
    ADD COLUMN IF NOT EXISTS payment_date DATE,
    ADD COLUMN IF NOT EXISTS payment_amount NUMERIC(12,2),
    ADD COLUMN IF NOT EXISTS tds_deposited NUMERIC(12,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS deposit_date DATE,
    ADD COLUMN IF NOT EXISTS challan_serial TEXT,
    ADD COLUMN IF NOT EXISTS bsr_code TEXT,
    ADD COLUMN IF NOT EXISTS challan_date DATE,
    ADD COLUMN IF NOT EXISTS challan_amount NUMERIC(12,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Make existing columns nullable for backward compatibility
ALTER TABLE ems.practice_tds_entries 
    ALTER COLUMN invoice_number DROP NOT NULL,
    ALTER COLUMN invoice_date DROP NOT NULL,
    ALTER COLUMN net_amount DROP NOT NULL;

-- ========== IT Returns: Expand schema ==========
ALTER TABLE ems.practice_it_returns 
    ADD COLUMN IF NOT EXISTS full_name TEXT,
    ADD COLUMN IF NOT EXISTS tax_regime TEXT DEFAULT 'NEW',
    ADD COLUMN IF NOT EXISTS salary_income NUMERIC(12,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS allowances NUMERIC(12,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS perquisites NUMERIC(12,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS gross_salary NUMERIC(14,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS rental_income NUMERIC(12,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS municipal_tax NUMERIC(12,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS home_loan_interest NUMERIC(12,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS income_from_house_property NUMERIC(14,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS interest_income NUMERIC(12,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS other_income NUMERIC(12,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS deduction_80e NUMERIC(12,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS deduction_80g NUMERIC(12,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS other_deductions NUMERIC(12,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS gross_total_income NUMERIC(14,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS total_deductions NUMERIC(14,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- ========== Permission grants ==========
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA ems TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA ems GRANT ALL PRIVILEGES ON TABLES TO service_role;
