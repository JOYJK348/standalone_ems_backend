-- ============================================================================
-- SEED: ALL PORTAL LOGIN USERS
-- ============================================================================
-- Password for every seeded account: admin@123
-- Run after 13_ems_rbac_approval_hardening.sql.
-- ============================================================================

BEGIN;

-- Existing core.employees schema may not have auth user linkage.
-- App services expect this mapping for tutor/staff login accounts.
ALTER TABLE core.employees
  ADD COLUMN IF NOT EXISTS user_id BIGINT;

CREATE INDEX IF NOT EXISTS idx_core_employees_user_id
  ON core.employees(user_id);

-- Ensure demo tenant and branch exist.
INSERT INTO core.companies (
  name,
  legal_name,
  code,
  email,
  phone,
  subscription_plan,
  subscription_start_date,
  subscription_end_date,
  enabled_modules,
  is_active
)
SELECT
  'Durkkas Institute of Professional Learning',
  'DIPL Pvt Ltd',
  'DIPL',
  'admin@dipl.edu',
  '+91-9876543210',
  'ENTERPRISE',
  CURRENT_DATE,
  CURRENT_DATE + INTERVAL '1 year',
  '["EMS", "HR", "ATTENDANCE", "FINANCE", "CRM"]'::jsonb,
  TRUE
WHERE NOT EXISTS (SELECT 1 FROM core.companies WHERE code = 'DIPL');

UPDATE core.companies
SET
  enabled_modules = '["EMS", "HR", "ATTENDANCE", "FINANCE", "CRM"]'::jsonb,
  subscription_plan = 'ENTERPRISE',
  is_active = TRUE,
  updated_at = NOW()
WHERE code = 'DIPL';

INSERT INTO core.branches (company_id, name, code, branch_type, email, phone, is_active)
SELECT
  c.id,
  'DIPL Main Campus',
  'DIPL-MAIN',
  'HQ',
  'campus@dipl.edu',
  '+91-9876543211',
  TRUE
FROM core.companies c
WHERE c.code = 'DIPL'
  AND NOT EXISTS (
    SELECT 1
    FROM core.branches b
    WHERE b.company_id = c.id
      AND b.code = 'DIPL-MAIN'
  );

-- Dynamic custom roles used by Layer 3.
INSERT INTO app_auth.roles (
  name,
  display_name,
  description,
  role_type,
  product,
  level,
  is_system_role,
  is_active
) VALUES
  ('ACADEMIC_COORDINATOR', 'Academic Coordinator', 'Dynamic role admin for academic operations with limited menu access.', 'CUSTOM', 'EMS', 3, FALSE, TRUE),
  ('FINANCE_MANAGER', 'Finance Manager', 'Dynamic role admin for finance and reports with menu-driven access.', 'CUSTOM', 'EMS', 3, FALSE, TRUE),
  ('PLACEMENT_OFFICER', 'Placement Officer', 'Dynamic role admin for progress, certificate and placement-focused access.', 'CUSTOM', 'EMS', 2, FALSE, TRUE)
ON CONFLICT (name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  role_type = EXCLUDED.role_type,
  product = EXCLUDED.product,
  level = EXCLUDED.level,
  is_active = TRUE,
  updated_at = NOW();

-- Users for every portal/layer.
WITH seed_users(email, first_name, last_name, display_name, role_name, employee_code, student_code) AS (
  VALUES
    ('platform.admin@durkkas.com', 'Platform', 'Admin', 'Platform Admin', 'PLATFORM_ADMIN', NULL, NULL),
    ('tenant.admin@dipl.edu', 'Tenant', 'Admin', 'Tenant Admin', 'TENANT_ADMIN', 'DIPL-TENANT-001', NULL),
    ('academic.coord@dipl.edu', 'Academic', 'Coordinator', 'Academic Coordinator', 'ACADEMIC_COORDINATOR', 'DIPL-ACAD-001', NULL),
    ('finance.manager@dipl.edu', 'Finance', 'Manager', 'Finance Manager', 'FINANCE_MANAGER', 'DIPL-FIN-001', NULL),
    ('placement.officer@dipl.edu', 'Placement', 'Officer', 'Placement Officer', 'PLACEMENT_OFFICER', 'DIPL-PLACE-001', NULL),
    ('tutor@dipl.edu', 'Demo', 'Tutor', 'Demo Tutor', 'TUTOR', 'DIPL-TUTOR-001', NULL),
    ('student@dipl.edu', 'Demo', 'Student', 'Demo Student', 'STUDENT', NULL, 'DIPL-STU-001')
)
INSERT INTO app_auth.users (
  email,
  password_hash,
  first_name,
  last_name,
  display_name,
  is_active,
  is_verified
)
SELECT
  email,
  '$2a$10$fiZI43Ofjx1KwWX/lAWdl.lTC0vtoa6GgaKm2hJmlaFHhnChSgVNS',
  first_name,
  last_name,
  display_name,
  TRUE,
  TRUE
FROM seed_users
ON CONFLICT (email) DO UPDATE SET
  password_hash = EXCLUDED.password_hash,
  first_name = EXCLUDED.first_name,
  last_name = EXCLUDED.last_name,
  display_name = EXCLUDED.display_name,
  is_active = TRUE,
  is_verified = TRUE,
  updated_at = NOW();

-- Staff employee records for tenant/dynamic/tutor users.
WITH staff_users(email, employee_code, first_name, last_name, designation_name) AS (
  VALUES
    ('tenant.admin@dipl.edu', 'DIPL-TENANT-001', 'Tenant', 'Admin', 'Tenant Admin'),
    ('academic.coord@dipl.edu', 'DIPL-ACAD-001', 'Academic', 'Coordinator', 'Academic Coordinator'),
    ('finance.manager@dipl.edu', 'DIPL-FIN-001', 'Finance', 'Manager', 'Finance Manager'),
    ('placement.officer@dipl.edu', 'DIPL-PLACE-001', 'Placement', 'Officer', 'Placement Officer'),
    ('tutor@dipl.edu', 'DIPL-TUTOR-001', 'Demo', 'Tutor', 'Tutor')
)
INSERT INTO core.employees (
  company_id,
  branch_id,
  user_id,
  employee_code,
  first_name,
  last_name,
  email,
  is_active
)
SELECT
  c.id,
  b.id,
  u.id,
  s.employee_code,
  s.first_name,
  s.last_name,
  s.email,
  TRUE
FROM staff_users s
JOIN app_auth.users u ON u.email = s.email
JOIN core.companies c ON c.code = 'DIPL'
JOIN core.branches b ON b.company_id = c.id AND b.code = 'DIPL-MAIN'
WHERE NOT EXISTS (
  SELECT 1
  FROM core.employees e
  WHERE e.company_id = c.id
    AND e.employee_code = s.employee_code
);

UPDATE core.employees e
SET
  user_id = u.id,
  is_active = TRUE,
  updated_at = NOW()
FROM app_auth.users u
WHERE e.email = u.email
  AND u.email IN ('tenant.admin@dipl.edu', 'academic.coord@dipl.edu', 'finance.manager@dipl.edu', 'placement.officer@dipl.edu', 'tutor@dipl.edu');

-- Student profile for student login.
INSERT INTO ems.students (
  company_id,
  branch_id,
  user_id,
  student_code,
  first_name,
  last_name,
  email,
  phone,
  status,
  is_active
)
SELECT
  c.id,
  b.id,
  u.id,
  'DIPL-STU-001',
  'Demo',
  'Student',
  'student@dipl.edu',
  '+91-9000000001',
  'ACTIVE',
  TRUE
FROM app_auth.users u
JOIN core.companies c ON c.code = 'DIPL'
JOIN core.branches b ON b.company_id = c.id AND b.code = 'DIPL-MAIN'
WHERE u.email = 'student@dipl.edu'
  AND NOT EXISTS (
    SELECT 1
    FROM ems.students s
    WHERE s.company_id = c.id
      AND s.student_code = 'DIPL-STU-001'
  );

UPDATE ems.students s
SET
  user_id = u.id,
  is_active = TRUE,
  updated_at = NOW()
FROM app_auth.users u
WHERE s.email = u.email
  AND u.email = 'student@dipl.edu';

-- Role assignments. Platform Admin has NULL company scope; all others are tenant scoped.
DELETE FROM app_auth.user_roles ur
USING app_auth.users u, app_auth.roles r
WHERE ur.user_id = u.id
  AND ur.role_id = r.id
  AND u.email IN (
    'platform.admin@durkkas.com',
    'tenant.admin@dipl.edu',
    'academic.coord@dipl.edu',
    'finance.manager@dipl.edu',
    'placement.officer@dipl.edu',
    'tutor@dipl.edu',
    'student@dipl.edu'
  )
  AND r.name IN (
    'PLATFORM_ADMIN',
    'TENANT_ADMIN',
    'ACADEMIC_COORDINATOR',
    'FINANCE_MANAGER',
    'PLACEMENT_OFFICER',
    'TUTOR',
    'STUDENT'
  );

WITH assignments(email, role_name, scoped_to_company) AS (
  VALUES
    ('platform.admin@durkkas.com', 'PLATFORM_ADMIN', FALSE),
    ('tenant.admin@dipl.edu', 'TENANT_ADMIN', TRUE),
    ('academic.coord@dipl.edu', 'ACADEMIC_COORDINATOR', TRUE),
    ('finance.manager@dipl.edu', 'FINANCE_MANAGER', TRUE),
    ('placement.officer@dipl.edu', 'PLACEMENT_OFFICER', TRUE),
    ('tutor@dipl.edu', 'TUTOR', TRUE),
    ('student@dipl.edu', 'STUDENT', TRUE)
)
INSERT INTO app_auth.user_roles (
  user_id,
  role_id,
  company_id,
  branch_id,
  is_active
)
SELECT
  u.id,
  r.id,
  CASE WHEN a.scoped_to_company THEN c.id ELSE NULL END,
  CASE WHEN a.scoped_to_company THEN b.id ELSE NULL END,
  TRUE
FROM assignments a
JOIN app_auth.users u ON u.email = a.email
JOIN app_auth.roles r ON r.name = a.role_name
LEFT JOIN core.companies c ON c.code = 'DIPL'
LEFT JOIN core.branches b ON b.company_id = c.id AND b.code = 'DIPL-MAIN';

-- Give dynamic roles practical menu scopes.
INSERT INTO ems.role_menu_scope_rules (
  company_id,
  role_id,
  menu_id,
  can_view,
  can_create,
  can_edit,
  can_delete,
  can_approve,
  data_scope
)
SELECT
  c.id,
  r.id,
  m.id,
  TRUE,
  r.name = 'ACADEMIC_COORDINATOR' AND m.menu_key IN ('ems.students', 'ems.batches', 'ems.live_classes'),
  r.name = 'ACADEMIC_COORDINATOR' AND m.menu_key IN ('ems.students', 'ems.batches', 'ems.live_classes'),
  FALSE,
  FALSE,
  'TENANT'
FROM core.companies c
JOIN app_auth.roles r ON r.name IN ('ACADEMIC_COORDINATOR', 'FINANCE_MANAGER', 'PLACEMENT_OFFICER')
JOIN app_auth.menu_registry m ON (
  (r.name = 'ACADEMIC_COORDINATOR' AND m.menu_key IN ('ems.dashboard', 'ems.students', 'ems.batches', 'ems.live_classes', 'ems.attendance', 'ems.reports'))
  OR (r.name = 'FINANCE_MANAGER' AND m.menu_key IN ('ems.dashboard', 'ems.reports'))
  OR (r.name = 'PLACEMENT_OFFICER' AND m.menu_key IN ('ems.dashboard', 'ems.students', 'ems.certificates', 'ems.reports'))
)
WHERE c.code = 'DIPL'
ON CONFLICT (company_id, role_id, menu_id) DO UPDATE SET
  can_view = EXCLUDED.can_view,
  can_create = EXCLUDED.can_create,
  can_edit = EXCLUDED.can_edit,
  can_delete = FALSE,
  can_approve = FALSE,
  data_scope = EXCLUDED.data_scope,
  updated_at = NOW();

COMMIT;

-- Verification:
-- SELECT u.email, r.name AS role_name, ur.company_id, ur.branch_id
-- FROM app_auth.users u
-- JOIN app_auth.user_roles ur ON ur.user_id = u.id
-- JOIN app_auth.roles r ON r.id = ur.role_id
-- WHERE u.email IN (
--   'platform.admin@durkkas.com',
--   'tenant.admin@dipl.edu',
--   'academic.coord@dipl.edu',
--   'finance.manager@dipl.edu',
--   'placement.officer@dipl.edu',
--   'tutor@dipl.edu',
--   'student@dipl.edu'
-- )
-- ORDER BY r.level DESC, u.email;
