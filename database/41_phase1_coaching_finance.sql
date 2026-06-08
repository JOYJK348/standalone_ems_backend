-- ============================================================================
-- PHASE 1: CORE COACHING FINANCE TABLES
-- Run AFTER: 40_fix_finance_menu_permissions.sql
-- ============================================================================

BEGIN;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 1. FEE INSTALLMENTS
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE IF NOT EXISTS ems.fee_installments (
  id BIGSERIAL PRIMARY KEY,
  fee_structure_id BIGINT NOT NULL REFERENCES ems.fee_structure(id) ON DELETE CASCADE,
  installment_no INTEGER NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  due_date DATE NOT NULL,
  is_paid BOOLEAN DEFAULT FALSE,
  paid_date DATE,
  late_fee DECIMAL(10,2) DEFAULT 0,
  payment_id BIGINT REFERENCES ems.fee_payments(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(fee_structure_id, installment_no)
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 2. DISCOUNTS
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE IF NOT EXISTS ems.discounts (
  id BIGSERIAL PRIMARY KEY,
  student_id BIGINT NOT NULL REFERENCES ems.students(id) ON DELETE CASCADE,
  fee_structure_id BIGINT NOT NULL REFERENCES ems.fee_structure(id) ON DELETE CASCADE,
  discount_type VARCHAR(50) NOT NULL, -- 'SIBLING', 'MERIT', 'BULK', 'CUSTOM', 'EARLY_BIRD'
  percentage DECIMAL(5,2),
  amount DECIMAL(10,2),
  reason TEXT,
  approved_by BIGINT REFERENCES app_auth.users(id),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3. EXPENSES
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE IF NOT EXISTS ems.expenses (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
  category VARCHAR(100) NOT NULL, -- 'RENT', 'SALARY', 'MARKETING', 'UTILITIES', 'MATERIALS', 'MAINTENANCE', 'SOFTWARE', 'TAXES', 'OTHER'
  amount DECIMAL(10,2) NOT NULL,
  expense_date DATE NOT NULL,
  description TEXT,
  payment_mode VARCHAR(50), -- 'CASH', 'UPI', 'BANK_TRANSFER', 'CHEQUE', 'CARD'
  vendor_name VARCHAR(200),
  vendor_gstin VARCHAR(20),
  receipt_url TEXT,
  gst_input DECIMAL(10,2) DEFAULT 0,
  is_recurring BOOLEAN DEFAULT FALSE,
  recurring_frequency VARCHAR(20), -- 'MONTHLY', 'QUARTERLY', 'YEARLY'
  next_due_date DATE,
  created_by BIGINT REFERENCES app_auth.users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 4. ENHANCE RECEIPT (add columns to fee_payments)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ALTER TABLE ems.fee_payments
  ADD COLUMN IF NOT EXISTS qr_code_url TEXT,
  ADD COLUMN IF NOT EXISTS due_balance DECIMAL(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_due_date DATE,
  ADD COLUMN IF NOT EXISTS receipt_format VARCHAR(20) DEFAULT 'STANDARD', -- 'STANDARD', 'GST', 'INSTALLMENT'
  ADD COLUMN IF NOT EXISTS installment_id BIGINT REFERENCES ems.fee_installments(id);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 5. LATE FEE CONFIG (per company)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE IF NOT EXISTS ems.late_fee_config (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
  fee_type VARCHAR(50) NOT NULL, -- 'TUITION', 'REGISTRATION', 'MATERIAL', 'EXAM'
  grace_period_days INTEGER DEFAULT 0,
  late_fee_type VARCHAR(20) DEFAULT 'FIXED', -- 'FIXED', 'PERCENTAGE'
  late_fee_amount DECIMAL(10,2),
  late_fee_percentage DECIMAL(5,2),
  max_late_fee DECIMAL(10,2),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(company_id, fee_type)
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 6. INDEXES
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE INDEX IF NOT EXISTS idx_fee_installments_structure ON ems.fee_installments(fee_structure_id);
CREATE INDEX IF NOT EXISTS idx_fee_installments_due ON ems.fee_installments(due_date);
CREATE INDEX IF NOT EXISTS idx_discounts_student ON ems.discounts(student_id);
CREATE INDEX IF NOT EXISTS idx_expenses_company ON ems.expenses(company_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON ems.expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON ems.expenses(category);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 7. GRANT PERMISSIONS
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA ems TO service_role, anon, authenticated;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA ems TO service_role, anon, authenticated;

COMMIT;
