-- EMS standalone platform-admin module cleanup.
-- Keeps subscription/company access focused on EMS modules only.

BEGIN;

UPDATE core.companies
SET enabled_modules = '["EMS", "LMS", "ATTENDANCE", "LIVE_CLASSES", "ASSESSMENTS", "MATERIALS"]'::jsonb,
    updated_at = NOW()
WHERE enabled_modules ?| ARRAY['HR', 'PAYROLL', 'CRM', 'FINANCE'];

UPDATE core.subscription_plans
SET enabled_modules = '["EMS", "LMS", "ATTENDANCE", "LIVE_CLASSES", "ASSESSMENTS", "MATERIALS"]'::jsonb,
    updated_at = NOW()
WHERE enabled_modules ?| ARRAY['HR', 'PAYROLL', 'CRM', 'FINANCE'];

UPDATE core.subscription_templates
SET enabled_modules = '["EMS", "LMS", "ATTENDANCE", "LIVE_CLASSES", "ASSESSMENTS", "MATERIALS"]'::jsonb,
    updated_at = NOW()
WHERE enabled_modules ?| ARRAY['HR', 'PAYROLL', 'CRM', 'FINANCE'];

COMMIT;