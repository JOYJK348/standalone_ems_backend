-- ============================================================================
-- PHASE 2: DUE TRACKING & PAYMENT LINKS
-- Run AFTER: 43_phase1_discount_workflow.sql
-- ============================================================================

BEGIN;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 1. DUE REMINDERS
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE IF NOT EXISTS ems.due_reminders (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
  student_id BIGINT NOT NULL REFERENCES ems.students(id) ON DELETE CASCADE,
  fee_structure_id BIGINT REFERENCES ems.fee_structure(id),
  installment_id BIGINT REFERENCES ems.fee_installments(id),
  invoice_id BIGINT REFERENCES ems.invoices(id),
  amount_due DECIMAL(12,2) NOT NULL DEFAULT 0,
  due_date DATE NOT NULL,
  reminder_date TIMESTAMPTZ,
  reminder_sent BOOLEAN DEFAULT FALSE,
  sent_via VARCHAR(20), -- 'WHATSAPP', 'SMS', 'EMAIL'
  payment_received BOOLEAN DEFAULT FALSE,
  late_fee_applied DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 2. PAYMENT LINKS
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE IF NOT EXISTS ems.payment_links (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
  student_id BIGINT NOT NULL REFERENCES ems.students(id) ON DELETE CASCADE,
  invoice_id BIGINT REFERENCES ems.invoices(id),
  amount DECIMAL(12,2) NOT NULL,
  link_url TEXT,
  short_url TEXT,
  provider VARCHAR(20) DEFAULT 'RAZORPAY', -- 'RAZORPAY', 'UPI', 'CUSTOM'
  status VARCHAR(20) DEFAULT 'ACTIVE', -- 'ACTIVE', 'PAID', 'EXPIRED', 'CANCELLED'
  expires_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  created_by BIGINT REFERENCES app_auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3. INDEXES
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE INDEX IF NOT EXISTS idx_due_reminders_company ON ems.due_reminders(company_id);
CREATE INDEX IF NOT EXISTS idx_due_reminders_student ON ems.due_reminders(student_id);
CREATE INDEX IF NOT EXISTS idx_due_reminders_due_date ON ems.due_reminders(due_date);
CREATE INDEX IF NOT EXISTS idx_due_reminders_sent ON ems.due_reminders(reminder_sent);
CREATE INDEX IF NOT EXISTS idx_payment_links_company ON ems.payment_links(company_id);
CREATE INDEX IF NOT EXISTS idx_payment_links_student ON ems.payment_links(student_id);
CREATE INDEX IF NOT EXISTS idx_payment_links_status ON ems.payment_links(status);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 4. GRANT PERMISSIONS
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA ems TO service_role, anon, authenticated;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA ems TO service_role, anon, authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
