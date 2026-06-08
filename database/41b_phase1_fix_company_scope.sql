-- ============================================================================
-- PHASE 1: FIX — Add company_id + soft-delete columns
-- Run AFTER: 41_phase1_coaching_finance.sql
--
-- fee_installments and discounts need company_id for tenant isolation
-- expenses needs deleted_at for soft delete
-- ============================================================================

BEGIN;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 1. Add company_id to fee_installments (scoped via fee_structure → courses)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ALTER TABLE ems.fee_installments
  ADD COLUMN IF NOT EXISTS company_id BIGINT REFERENCES core.companies(id);

UPDATE ems.fee_installments fi
SET company_id = fs.company_id
FROM ems.fee_structure fs
WHERE fi.fee_structure_id = fs.id AND fi.company_id IS NULL;

ALTER TABLE ems.fee_installments
  ALTER COLUMN company_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_fee_installments_company ON ems.fee_installments(company_id);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 2. Add company_id to discounts (scoped via students)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ALTER TABLE ems.discounts
  ADD COLUMN IF NOT EXISTS company_id BIGINT REFERENCES core.companies(id);

UPDATE ems.discounts d
SET company_id = s.company_id
FROM ems.students s
WHERE d.student_id = s.id AND d.company_id IS NULL;

ALTER TABLE ems.discounts
  ALTER COLUMN company_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_discounts_company ON ems.discounts(company_id);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3. Add soft-delete columns to expenses
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ALTER TABLE ems.expenses
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS deleted_by BIGINT REFERENCES app_auth.users(id);

CREATE INDEX IF NOT EXISTS idx_expenses_deleted ON ems.expenses(deleted_at);

COMMIT;
