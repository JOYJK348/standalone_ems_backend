-- ============================================================================
-- Migration 47b: Fix Practice Lab Table Names + Add Missing Tables
-- Fixes: practice_gst_invoices -> practice_gst_entries
-- Adds: practice_tds_entries, practice_it_returns
-- Adds: enabled_practice_modules column to courses
-- ============================================================================

-- Drop incorrectly named table from migration 47 (if already run)
DROP TABLE IF EXISTS ems.practice_gst_invoices CASCADE;

-- Practice GST Entries
CREATE TABLE IF NOT EXISTS ems.practice_gst_entries (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT REFERENCES core.companies(id) ON DELETE SET NULL,
    allocation_id BIGINT NOT NULL REFERENCES ems.student_practice_allocations(id) ON DELETE CASCADE,
    gstin TEXT NOT NULL,
    business_name TEXT NOT NULL,
    invoice_number TEXT NOT NULL,
    invoice_date DATE NOT NULL,
    customer_name TEXT NOT NULL,
    customer_gstin TEXT,
    place_of_supply TEXT NOT NULL,
    taxable_value NUMERIC(12,2) NOT NULL,
    gst_rate NUMERIC(5,2) NOT NULL,
    cgst NUMERIC(12,2) NOT NULL DEFAULT 0,
    sgst NUMERIC(12,2) NOT NULL DEFAULT 0,
    igst NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_amount NUMERIC(12,2) NOT NULL,
    is_correct BOOLEAN,
    feedback_notes TEXT,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_practice_gst_entries_allocation 
    ON ems.practice_gst_entries(allocation_id);

-- Practice TDS Entries
CREATE TABLE IF NOT EXISTS ems.practice_tds_entries (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT REFERENCES core.companies(id) ON DELETE SET NULL,
    allocation_id BIGINT NOT NULL REFERENCES ems.student_practice_allocations(id) ON DELETE CASCADE,
    deductee_name TEXT NOT NULL,
    deductee_pan TEXT NOT NULL,
    tds_section TEXT NOT NULL,
    invoice_number TEXT,
    invoice_date DATE,
    gross_amount NUMERIC(12,2) NOT NULL,
    tds_rate NUMERIC(5,2) NOT NULL,
    tds_deducted NUMERIC(12,2) NOT NULL,
    net_amount NUMERIC(12,2) NOT NULL,
    is_correct BOOLEAN,
    feedback_notes TEXT,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_practice_tds_entries_allocation 
    ON ems.practice_tds_entries(allocation_id);

-- Practice Income Tax Returns
CREATE TABLE IF NOT EXISTS ems.practice_it_returns (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT REFERENCES core.companies(id) ON DELETE SET NULL,
    allocation_id BIGINT NOT NULL REFERENCES ems.student_practice_allocations(id) ON DELETE CASCADE,
    pan TEXT NOT NULL,
    assessment_year TEXT NOT NULL,
    gross_income NUMERIC(14,2) NOT NULL,
    deductions_80c NUMERIC(12,2) DEFAULT 0,
    deductions_80d NUMERIC(12,2) DEFAULT 0,
    taxable_income NUMERIC(14,2) NOT NULL,
    tax_payable NUMERIC(12,2) NOT NULL,
    status TEXT NOT NULL DEFAULT 'SUBMITTED',
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_practice_it_returns_allocation 
    ON ems.practice_it_returns(allocation_id);

-- Add enabled_practice_modules column to courses
ALTER TABLE ems.courses ADD COLUMN IF NOT EXISTS enabled_practice_modules TEXT[] DEFAULT '{}';

-- Seed default quotas for DIPL company
INSERT INTO ems.practice_quotas (company_id, module_type, total_licenses, used_licenses)
SELECT id, 'GST', 100, 0 FROM core.companies WHERE code = 'DIPL'
ON CONFLICT (company_id, module_type) DO NOTHING;

INSERT INTO ems.practice_quotas (company_id, module_type, total_licenses, used_licenses)
SELECT id, 'TDS', 100, 0 FROM core.companies WHERE code = 'DIPL'
ON CONFLICT (company_id, module_type) DO NOTHING;

INSERT INTO ems.practice_quotas (company_id, module_type, total_licenses, used_licenses)
SELECT id, 'INCOME_TAX', 100, 0 FROM core.companies WHERE code = 'DIPL'
ON CONFLICT (company_id, module_type) DO NOTHING;
