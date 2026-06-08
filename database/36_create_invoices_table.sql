-- Migration: Create ems.invoices table for Finance Manager module
-- Also seed initial invoice entries for testing

CREATE TABLE IF NOT EXISTS ems.invoices (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
    student_id BIGINT REFERENCES ems.students(id) ON DELETE SET NULL,
    enrollment_id BIGINT REFERENCES ems.student_enrollments(id) ON DELETE SET NULL,
    invoice_number VARCHAR(100) NOT NULL,
    amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    due_date DATE NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by BIGINT REFERENCES app_auth.users(id) ON DELETE SET NULL,
    deleted_at TIMESTAMPTZ,
    deleted_by BIGINT REFERENCES app_auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_ems_invoices_company ON ems.invoices(company_id);
CREATE INDEX IF NOT EXISTS idx_ems_invoices_status ON ems.invoices(status);
CREATE INDEX IF NOT EXISTS idx_ems_invoices_due_date ON ems.invoices(due_date);
CREATE INDEX IF NOT EXISTS idx_ems_invoices_deleted ON ems.invoices(deleted_at);

-- Seed invoice data — simple, no JOINs to avoid missing column errors
INSERT INTO ems.invoices (company_id, student_id, invoice_number, amount, due_date, status, description)
SELECT
    s.company_id,
    s.id,
    'INV-' || LPAD(ROW_NUMBER() OVER (ORDER BY s.id)::TEXT, 4, '0'),
    (5000 + (random() * 45000)::INT)::NUMERIC(12,2),
    CURRENT_DATE + (random() * 25 + 5)::INT,
    CASE floor(random() * 3)
        WHEN 0 THEN 'pending'
        WHEN 1 THEN 'paid'
        WHEN 2 THEN 'overdue'
    END,
    'Course fee invoice'
FROM ems.students s
WHERE s.company_id IS NOT NULL
LIMIT 15;
