-- ============================================================================
-- Migration 47: Practice Lab Tables (GST, TDS, Income Tax)
-- Creates tables for practice allocations, quotas, and GST invoices
-- ============================================================================

-- Practice Quotas (company-level license tracking)
CREATE TABLE IF NOT EXISTS ems.practice_quotas (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
    module_type TEXT NOT NULL CHECK (module_type IN ('GST', 'TDS', 'INCOME_TAX')),
    total_licenses INTEGER NOT NULL DEFAULT 0,
    used_licenses INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_practice_quotas_company_module 
    ON ems.practice_quotas(company_id, module_type);

-- Student Practice Allocations
CREATE TABLE IF NOT EXISTS ems.student_practice_allocations (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
    student_id BIGINT NOT NULL REFERENCES ems.students(id) ON DELETE CASCADE,
    course_id BIGINT NOT NULL REFERENCES ems.courses(id) ON DELETE CASCADE,
    module_type TEXT NOT NULL CHECK (module_type IN ('GST', 'TDS', 'INCOME_TAX')),
    usage_limit INTEGER NOT NULL DEFAULT 5,
    used_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'EXHAUSTED', 'EXPIRED')),
    allocated_by BIGINT REFERENCES app_auth.users(id),
    allocated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_student_practice_allocations_student 
    ON ems.student_practice_allocations(student_id, module_type);

-- Practice GST Invoices
CREATE TABLE IF NOT EXISTS ems.practice_gst_invoices (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
    allocation_id BIGINT NOT NULL REFERENCES ems.student_practice_allocations(id) ON DELETE CASCADE,
    student_id BIGINT NOT NULL REFERENCES ems.students(id) ON DELETE CASCADE,
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
    score NUMERIC(5,2),
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_practice_gst_invoices_allocation 
    ON ems.practice_gst_invoices(allocation_id);

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
