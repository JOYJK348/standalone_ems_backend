-- ============================================================================
-- EMS RBAC + APPROVAL HARDENING
-- ============================================================================
-- Purpose:
--   1. Standard EMS role hierarchy
--   2. Strong CRUD permission model
--   3. Approval lifecycle columns for EMS academic tables
--   4. Central approval request queue
--   5. Tenant-scoped delete protection
--   6. EMS menu permissions by role
--   7. LMS naming cleanup to EMS for DB/menu/subscription access
--
-- Run order:
--   Run after 02_auth_schema.sql, 04_ems_schema_v2.sql,
--   20_subscription_system.sql and 28_subscription_access_control.sql.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Make this migration compatible with the existing auth schema.
ALTER TABLE app_auth.permissions
  ADD COLUMN IF NOT EXISTS product VARCHAR(50);

ALTER TABLE app_auth.role_permissions
  ADD COLUMN IF NOT EXISTS is_granted BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- ============================================================================
-- 01. EMS ROLE HIERARCHY
-- ============================================================================

INSERT INTO app_auth.roles (
  name,
  display_name,
  description,
  level,
  role_type,
  product,
  is_system_role,
  is_active
) VALUES
  (
    'TENANT_ADMIN',
    'Tenant Admin',
    'Owns one institute/tenant. Full EMS access inside own company only, including delete and final approval.',
    4,
    'COMPANY',
    'EMS',
    TRUE,
    TRUE
  ),
  (
    'ACADEMIC_MANAGER',
    'Academic Manager',
    'Manages students, tutors, batches, courses, approvals, schedules and academic reports.',
    3,
    'PRODUCT',
    'EMS',
    TRUE,
    TRUE
  ),
  (
    'TUTOR',
    'Tutor',
    'Teaches assigned batches/courses, creates learning content, marks attendance and evaluates submissions.',
    2,
    'PRODUCT',
    'EMS',
    TRUE,
    TRUE
  ),
  (
    'STUDENT',
    'Student',
    'Learner account with access to enrolled courses, materials, classes, assignments and quizzes.',
    1,
    'PRODUCT',
    'EMS',
    TRUE,
    TRUE
  ),
  (
    'BRANCH_ADMIN',
    'Branch Admin',
    'Compatibility role for branch-level academic operations. No hard delete permission by default.',
    3,
    'COMPANY',
    'EMS',
    TRUE,
    TRUE
  )
ON CONFLICT (name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  level = EXCLUDED.level,
  role_type = EXCLUDED.role_type,
  product = EXCLUDED.product,
  is_system_role = TRUE,
  is_active = TRUE,
  updated_at = NOW();

UPDATE app_auth.roles
SET
  display_name = 'EMS Admin',
  description = 'EMS product administrator with academic approval and operational control, excluding tenant-owner-only deletes.',
  level = 3,
  role_type = 'PRODUCT',
  product = 'EMS',
  is_active = TRUE,
  updated_at = NOW()
WHERE name = 'EMS_ADMIN';  -- DEPRECATED: removed in migration 38

-- ============================================================================
-- 02. EMS CRUD + WORKFLOW PERMISSIONS
-- ============================================================================

WITH ems_permissions(name, display_name, description, resource, action) AS (
  VALUES
    ('ems.dashboard.view', 'View EMS Dashboard', 'Open EMS dashboard and academic overview.', 'dashboard', 'view'),

    ('ems.students.view', 'View Students', 'View student records inside own tenant.', 'students', 'view'),
    ('ems.students.create', 'Create Students', 'Create student records inside own tenant.', 'students', 'create'),
    ('ems.students.edit', 'Edit Students', 'Edit student records inside own tenant.', 'students', 'edit'),
    ('ems.students.delete', 'Delete Students', 'Tenant-admin-only soft delete for student records.', 'students', 'delete'),
    ('ems.students.import', 'Import Students', 'Bulk import students through CSV or controlled import flow.', 'students', 'import'),
    ('ems.students.export', 'Export Students', 'Export student records and academic reports.', 'students', 'export'),

    ('ems.tutors.view', 'View Tutors', 'View tutor records inside own tenant.', 'tutors', 'view'),
    ('ems.tutors.create', 'Create Tutors', 'Create tutor records inside own tenant.', 'tutors', 'create'),
    ('ems.tutors.edit', 'Edit Tutors', 'Edit tutor records inside own tenant.', 'tutors', 'edit'),
    ('ems.tutors.delete', 'Delete Tutors', 'Tenant-admin-only soft delete for tutor records.', 'tutors', 'delete'),

    ('ems.courses.view', 'View Courses', 'View EMS courses.', 'courses', 'view'),
    ('ems.courses.create', 'Create Courses', 'Create EMS courses in draft/pending state.', 'courses', 'create'),
    ('ems.courses.edit', 'Edit Courses', 'Edit EMS courses.', 'courses', 'edit'),
    ('ems.courses.delete', 'Delete Courses', 'Tenant-admin-only soft delete for EMS courses.', 'courses', 'delete'),
    ('ems.courses.approve', 'Approve Courses', 'Approve or reject EMS course changes.', 'courses', 'approve'),
    ('ems.courses.publish', 'Publish Courses', 'Publish approved EMS courses to students.', 'courses', 'publish'),

    ('ems.modules.view', 'View Modules', 'View course modules.', 'modules', 'view'),
    ('ems.modules.create', 'Create Modules', 'Create course modules in pending approval state.', 'modules', 'create'),
    ('ems.modules.edit', 'Edit Modules', 'Edit course modules.', 'modules', 'edit'),
    ('ems.modules.delete', 'Delete Modules', 'Tenant-admin-only soft delete for modules.', 'modules', 'delete'),
    ('ems.modules.approve', 'Approve Modules', 'Approve or reject course modules.', 'modules', 'approve'),

    ('ems.lessons.view', 'View Lessons', 'View lessons.', 'lessons', 'view'),
    ('ems.lessons.create', 'Create Lessons', 'Create lessons in pending approval state.', 'lessons', 'create'),
    ('ems.lessons.edit', 'Edit Lessons', 'Edit lessons.', 'lessons', 'edit'),
    ('ems.lessons.delete', 'Delete Lessons', 'Tenant-admin-only soft delete for lessons.', 'lessons', 'delete'),
    ('ems.lessons.approve', 'Approve Lessons', 'Approve or reject lessons.', 'lessons', 'approve'),

    ('ems.materials.view', 'View Materials', 'View course materials/resources.', 'materials', 'view'),
    ('ems.materials.create', 'Create Materials', 'Upload or create course materials in pending approval state.', 'materials', 'create'),
    ('ems.materials.edit', 'Edit Materials', 'Edit course materials/resources.', 'materials', 'edit'),
    ('ems.materials.delete', 'Delete Materials', 'Tenant-admin-only soft delete for materials.', 'materials', 'delete'),
    ('ems.materials.approve', 'Approve Materials', 'Approve or reject course materials/resources.', 'materials', 'approve'),

    ('ems.batches.view', 'View Batches', 'View batches.', 'batches', 'view'),
    ('ems.batches.create', 'Create Batches', 'Create batches in pending approval state.', 'batches', 'create'),
    ('ems.batches.edit', 'Edit Batches', 'Edit batches.', 'batches', 'edit'),
    ('ems.batches.delete', 'Delete Batches', 'Tenant-admin-only soft delete for batches.', 'batches', 'delete'),
    ('ems.batches.approve', 'Approve Batches', 'Approve or reject batches.', 'batches', 'approve'),

    ('ems.enrollments.view', 'View Enrollments', 'View student enrollments.', 'enrollments', 'view'),
    ('ems.enrollments.create', 'Create Enrollments', 'Enroll students into batches/courses.', 'enrollments', 'create'),
    ('ems.enrollments.edit', 'Edit Enrollments', 'Update enrollment status and metadata.', 'enrollments', 'edit'),
    ('ems.enrollments.delete', 'Delete Enrollments', 'Tenant-admin-only soft delete for enrollments.', 'enrollments', 'delete'),

    ('ems.assignments.view', 'View Assignments', 'View assignments.', 'assignments', 'view'),
    ('ems.assignments.create', 'Create Assignments', 'Create assignments in pending approval state.', 'assignments', 'create'),
    ('ems.assignments.edit', 'Edit Assignments', 'Edit assignments.', 'assignments', 'edit'),
    ('ems.assignments.delete', 'Delete Assignments', 'Tenant-admin-only soft delete for assignments.', 'assignments', 'delete'),
    ('ems.assignments.approve', 'Approve Assignments', 'Approve or reject assignments.', 'assignments', 'approve'),
    ('ems.assignments.grade', 'Grade Assignments', 'Evaluate and grade assignment submissions.', 'assignments', 'grade'),
    ('ems.assignments.submit', 'Submit Assignments', 'Submit own assignment work.', 'assignments', 'submit'),

    ('ems.quizzes.view', 'View Quizzes', 'View quizzes.', 'quizzes', 'view'),
    ('ems.quizzes.create', 'Create Quizzes', 'Create quizzes in pending approval state.', 'quizzes', 'create'),
    ('ems.quizzes.edit', 'Edit Quizzes', 'Edit quizzes.', 'quizzes', 'edit'),
    ('ems.quizzes.delete', 'Delete Quizzes', 'Tenant-admin-only soft delete for quizzes.', 'quizzes', 'delete'),
    ('ems.quizzes.approve', 'Approve Quizzes', 'Approve or reject quizzes.', 'quizzes', 'approve'),
    ('ems.quizzes.grade', 'Grade Quizzes', 'Evaluate quiz attempts where manual review is required.', 'quizzes', 'grade'),
    ('ems.quizzes.submit', 'Attempt Quizzes', 'Submit own quiz attempts.', 'quizzes', 'submit'),

    ('ems.live_classes.view', 'View Live Classes', 'View live classes.', 'live_classes', 'view'),
    ('ems.live_classes.create', 'Create Live Classes', 'Create live classes in pending approval state.', 'live_classes', 'create'),
    ('ems.live_classes.edit', 'Edit Live Classes', 'Edit live classes.', 'live_classes', 'edit'),
    ('ems.live_classes.delete', 'Delete Live Classes', 'Tenant-admin-only soft delete for live classes.', 'live_classes', 'delete'),
    ('ems.live_classes.approve', 'Approve Live Classes', 'Approve or reject live classes.', 'live_classes', 'approve'),
    ('ems.live_classes.join', 'Join Live Classes', 'Join permitted live classes.', 'live_classes', 'join'),

    ('ems.attendance.view', 'View Attendance', 'View attendance records and sessions.', 'attendance', 'view'),
    ('ems.attendance.create', 'Create Attendance Sessions', 'Create attendance sessions.', 'attendance', 'create'),
    ('ems.attendance.edit', 'Edit Attendance', 'Edit attendance records.', 'attendance', 'edit'),
    ('ems.attendance.delete', 'Delete Attendance', 'Tenant-admin-only soft delete for attendance records.', 'attendance', 'delete'),
    ('ems.attendance.approve', 'Approve Attendance Sessions', 'Approve or reject attendance sessions.', 'attendance', 'approve'),
    ('ems.attendance.mark', 'Mark Attendance', 'Mark student attendance.', 'attendance', 'mark'),

    ('ems.approvals.view', 'View Approval Queue', 'View pending EMS approval requests.', 'approvals', 'view'),
    ('ems.approvals.manage', 'Manage Approval Queue', 'Approve, reject, request changes and audit EMS approval requests.', 'approvals', 'manage'),

    ('ems.doubts.view', 'View Doubts', 'View student doubts and tutor replies.', 'doubts', 'view'),
    ('ems.doubts.create', 'Create Doubts', 'Create own doubt/question.', 'doubts', 'create'),
    ('ems.doubts.reply', 'Reply Doubts', 'Reply to student doubts.', 'doubts', 'reply'),
    ('ems.doubts.delete', 'Delete Doubts', 'Tenant-admin-only soft delete for doubts.', 'doubts', 'delete'),

    ('ems.notifications.view', 'View Notifications', 'View EMS notifications.', 'notifications', 'view'),
    ('ems.notifications.create', 'Create Notifications', 'Create tenant-scoped EMS notifications.', 'notifications', 'create'),
    ('ems.notifications.manage', 'Manage Notifications', 'Manage EMS notification templates and delivery.', 'notifications', 'manage'),

    ('ems.certificates.view', 'View Certificates', 'View certificates.', 'certificates', 'view'),
    ('ems.certificates.create', 'Create Certificates', 'Generate certificates.', 'certificates', 'create'),
    ('ems.certificates.edit', 'Edit Certificates', 'Edit certificate metadata.', 'certificates', 'edit'),
    ('ems.certificates.delete', 'Delete Certificates', 'Tenant-admin-only soft delete for certificates.', 'certificates', 'delete'),
    ('ems.certificates.approve', 'Approve Certificates', 'Approve certificate issue/revoke requests.', 'certificates', 'approve'),

    ('ems.reports.view', 'View Reports', 'View EMS reports.', 'reports', 'view'),
    ('ems.reports.export', 'Export Reports', 'Export EMS reports.', 'reports', 'export'),

    ('ems.settings.view', 'View EMS Settings', 'View EMS tenant settings.', 'settings', 'view'),
    ('ems.settings.edit', 'Edit EMS Settings', 'Edit EMS tenant settings.', 'settings', 'edit')
)
INSERT INTO app_auth.permissions (
  name,
  display_name,
  description,
  permission_scope,
  schema_name,
  resource,
  action,
  product,
  is_active
)
SELECT
  name,
  display_name,
  description,
  'PRODUCT',
  'ems',
  resource,
  action,
  'EMS',
  TRUE
FROM ems_permissions
ON CONFLICT (name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  resource = EXCLUDED.resource,
  action = EXCLUDED.action,
  product = 'EMS',
  is_active = TRUE,
  updated_at = NOW();

-- Tenant owners get every EMS permission, including delete.
INSERT INTO app_auth.role_permissions (role_id, permission_id, is_granted)
SELECT r.id, p.id, TRUE
FROM app_auth.roles r
JOIN app_auth.permissions p ON p.product = 'EMS' AND p.name LIKE 'ems.%'
WHERE r.name IN ('PLATFORM_ADMIN', 'COMPANY_ADMIN', 'TENANT_ADMIN')
ON CONFLICT (role_id, permission_id) DO UPDATE SET
  is_granted = TRUE,
  updated_at = NOW();

-- Academic operators can run the product, approve content, and export reports,
-- but tenant-owner delete stays blocked.
INSERT INTO app_auth.role_permissions (role_id, permission_id, is_granted)
SELECT r.id, p.id, TRUE
FROM app_auth.roles r
JOIN app_auth.permissions p ON p.product = 'EMS' AND p.name LIKE 'ems.%'
WHERE r.name IN ('ACADEMIC_MANAGER', 'BRANCH_ADMIN')
  AND p.action <> 'delete'
ON CONFLICT (role_id, permission_id) DO UPDATE SET
  is_granted = TRUE,
  updated_at = NOW();

-- Tutor permissions are intentionally assignment/teaching scoped.
INSERT INTO app_auth.role_permissions (role_id, permission_id, is_granted)
SELECT r.id, p.id, TRUE
FROM app_auth.roles r
JOIN app_auth.permissions p ON p.name = ANY (ARRAY[
  'ems.dashboard.view',
  'ems.students.view',
  'ems.courses.view',
  'ems.courses.create',
  'ems.courses.edit',
  'ems.modules.view',
  'ems.modules.create',
  'ems.modules.edit',
  'ems.lessons.view',
  'ems.lessons.create',
  'ems.lessons.edit',
  'ems.materials.view',
  'ems.materials.create',
  'ems.materials.edit',
  'ems.batches.view',
  'ems.assignments.view',
  'ems.assignments.create',
  'ems.assignments.edit',
  'ems.assignments.grade',
  'ems.quizzes.view',
  'ems.quizzes.create',
  'ems.quizzes.edit',
  'ems.quizzes.grade',
  'ems.live_classes.view',
  'ems.live_classes.create',
  'ems.live_classes.edit',
  'ems.live_classes.join',
  'ems.attendance.view',
  'ems.attendance.create',
  'ems.attendance.edit',
  'ems.attendance.mark',
  'ems.doubts.view',
  'ems.doubts.reply',
  'ems.notifications.view',
  'ems.certificates.view',
  'ems.reports.view'
])
WHERE r.name = 'TUTOR'
ON CONFLICT (role_id, permission_id) DO UPDATE SET
  is_granted = TRUE,
  updated_at = NOW();

-- Student permissions are own-learning scoped.
INSERT INTO app_auth.role_permissions (role_id, permission_id, is_granted)
SELECT r.id, p.id, TRUE
FROM app_auth.roles r
JOIN app_auth.permissions p ON p.name = ANY (ARRAY[
  'ems.dashboard.view',
  'ems.courses.view',
  'ems.modules.view',
  'ems.lessons.view',
  'ems.materials.view',
  'ems.batches.view',
  'ems.assignments.view',
  'ems.assignments.submit',
  'ems.quizzes.view',
  'ems.quizzes.submit',
  'ems.live_classes.view',
  'ems.live_classes.join',
  'ems.attendance.view',
  'ems.doubts.view',
  'ems.doubts.create',
  'ems.notifications.view',
  'ems.certificates.view'
])
WHERE r.name = 'STUDENT'
ON CONFLICT (role_id, permission_id) DO UPDATE SET
  is_granted = TRUE,
  updated_at = NOW();

-- Explicitly revoke hard/soft delete permissions from non-tenant-owner EMS roles.
UPDATE app_auth.role_permissions rp
SET is_granted = FALSE, updated_at = NOW()
FROM app_auth.roles r, app_auth.permissions p
WHERE rp.role_id = r.id
  AND rp.permission_id = p.id
  AND p.product = 'EMS'
  AND p.action = 'delete'
  AND r.name IN ('ACADEMIC_MANAGER', 'BRANCH_ADMIN', 'TUTOR', 'STUDENT');

-- ============================================================================
-- 03. APPROVAL COLUMNS FOR EMS MANAGED TABLES
-- ============================================================================

DO $$
DECLARE
  tbl TEXT;
  managed_tables TEXT[] := ARRAY[
    'courses',
    'course_modules',
    'lessons',
    'course_materials',
    'assignments',
    'quizzes',
    'batches',
    'live_classes',
    'attendance_sessions',
    'certificates',
    'announcements',
    'tutor_announcements'
  ];
BEGIN
  FOREACH tbl IN ARRAY managed_tables LOOP
    IF EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'ems'
        AND table_name = tbl
    ) THEN
      EXECUTE format('ALTER TABLE ems.%I ADD COLUMN IF NOT EXISTS approval_status VARCHAR(30) DEFAULT ''PENDING''', tbl);
      EXECUTE format('ALTER TABLE ems.%I ADD COLUMN IF NOT EXISTS approval_requested_by BIGINT REFERENCES app_auth.users(id)', tbl);
      EXECUTE format('ALTER TABLE ems.%I ADD COLUMN IF NOT EXISTS approval_requested_at TIMESTAMPTZ DEFAULT NOW()', tbl);
      EXECUTE format('ALTER TABLE ems.%I ADD COLUMN IF NOT EXISTS approved_by BIGINT REFERENCES app_auth.users(id)', tbl);
      EXECUTE format('ALTER TABLE ems.%I ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ', tbl);
      EXECUTE format('ALTER TABLE ems.%I ADD COLUMN IF NOT EXISTS approval_notes TEXT', tbl);
      EXECUTE format('ALTER TABLE ems.%I ADD COLUMN IF NOT EXISTS rejection_reason TEXT', tbl);
      EXECUTE format('ALTER TABLE ems.%I ADD COLUMN IF NOT EXISTS published_by BIGINT REFERENCES app_auth.users(id)', tbl);
      EXECUTE format('ALTER TABLE ems.%I ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ', tbl);
      EXECUTE format(
        'CREATE INDEX IF NOT EXISTS %I ON ems.%I(company_id, approval_status)',
        'idx_ems_' || tbl || '_company_approval_status',
        tbl
      );

      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = format('chk_ems_%s_approval_status', tbl)
      ) THEN
        EXECUTE format(
          'ALTER TABLE ems.%I ADD CONSTRAINT %I CHECK (approval_status IN (''DRAFT'', ''PENDING'', ''APPROVED'', ''REJECTED'', ''CHANGES_REQUESTED'', ''PUBLISHED'', ''ARCHIVED''))',
          tbl,
          format('chk_ems_%s_approval_status', tbl)
        );
      END IF;
    END IF;
  END LOOP;
END $$;

-- ============================================================================
-- 04. CENTRAL APPROVAL REQUESTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS ems.approval_requests (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
  branch_id BIGINT REFERENCES core.branches(id) ON DELETE SET NULL,
  entity_schema VARCHAR(50) NOT NULL DEFAULT 'ems',
  entity_table VARCHAR(100) NOT NULL,
  entity_type VARCHAR(100) NOT NULL,
  entity_id BIGINT NOT NULL,
  action_type VARCHAR(50) NOT NULL DEFAULT 'PUBLISH',
  current_status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
  requested_by BIGINT REFERENCES app_auth.users(id) ON DELETE SET NULL,
  requested_role VARCHAR(100),
  request_note TEXT,
  reviewed_by BIGINT REFERENCES app_auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  review_note TEXT,
  rejection_reason TEXT,
  previous_values JSONB,
  proposed_values JSONB,
  decision_values JSONB,
  priority VARCHAR(20) NOT NULL DEFAULT 'NORMAL',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT chk_ems_approval_request_status CHECK (
    current_status IN ('PENDING', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED', 'CANCELLED')
  ),
  CONSTRAINT chk_ems_approval_request_action CHECK (
    action_type IN ('CREATE', 'UPDATE', 'PUBLISH', 'DELETE', 'ARCHIVE', 'RESTORE', 'ISSUE', 'REVOKE')
  ),
  CONSTRAINT chk_ems_approval_request_priority CHECK (
    priority IN ('LOW', 'NORMAL', 'HIGH', 'URGENT')
  )
);

CREATE INDEX IF NOT EXISTS idx_ems_approval_requests_company_status
  ON ems.approval_requests(company_id, current_status);

CREATE INDEX IF NOT EXISTS idx_ems_approval_requests_entity
  ON ems.approval_requests(entity_schema, entity_table, entity_id);

CREATE INDEX IF NOT EXISTS idx_ems_approval_requests_requested_by
  ON ems.approval_requests(requested_by, current_status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ems_approval_requests_one_pending
  ON ems.approval_requests(company_id, entity_schema, entity_table, entity_id, action_type)
  WHERE current_status = 'PENDING';

DROP TRIGGER IF EXISTS update_ems_approval_requests_updated_at ON ems.approval_requests;
CREATE TRIGGER update_ems_approval_requests_updated_at
  BEFORE UPDATE ON ems.approval_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 05. APPROVAL REQUEST AUTO-QUEUE + REVIEW HELPERS
-- ============================================================================

CREATE OR REPLACE FUNCTION ems.create_approval_request_from_row()
RETURNS TRIGGER AS $$
DECLARE
  row_data JSONB;
  v_company_id BIGINT;
  v_branch_id BIGINT;
  v_requested_by BIGINT;
  v_action_type VARCHAR(50);
BEGIN
  row_data := to_jsonb(NEW);
  v_company_id := NULLIF(row_data->>'company_id', '')::BIGINT;
  v_branch_id := NULLIF(row_data->>'branch_id', '')::BIGINT;
  v_requested_by := COALESCE(
    NULLIF(row_data->>'approval_requested_by', '')::BIGINT,
    NULLIF(row_data->>'created_by', '')::BIGINT,
    NULLIF(row_data->>'uploaded_by', '')::BIGINT,
    NULLIF(row_data->>'session_opened_by', '')::BIGINT
  );

  IF COALESCE(row_data->>'approval_status', 'PENDING') <> 'PENDING' THEN
    RETURN NEW;
  END IF;

  v_action_type := CASE
    WHEN TG_OP = 'INSERT' THEN 'CREATE'
    ELSE 'UPDATE'
  END;

  INSERT INTO ems.approval_requests (
    company_id,
    branch_id,
    entity_schema,
    entity_table,
    entity_type,
    entity_id,
    action_type,
    current_status,
    requested_by,
    requested_role,
    proposed_values
  ) VALUES (
    v_company_id,
    v_branch_id,
    TG_TABLE_SCHEMA,
    TG_TABLE_NAME,
    TG_TABLE_NAME,
    NEW.id,
    v_action_type,
    'PENDING',
    v_requested_by,
    NULL,
    row_data
  )
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  tbl TEXT;
  managed_tables TEXT[] := ARRAY[
    'courses',
    'course_modules',
    'lessons',
    'course_materials',
    'assignments',
    'quizzes',
    'batches',
    'live_classes',
    'attendance_sessions',
    'certificates',
    'announcements',
    'tutor_announcements'
  ];
BEGIN
  FOREACH tbl IN ARRAY managed_tables LOOP
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'ems'
        AND table_name = tbl
        AND column_name = 'approval_status'
    ) THEN
      EXECUTE format(
        'DROP TRIGGER IF EXISTS %I ON ems.%I',
        'trg_ems_' || tbl || '_approval_queue',
        tbl
      );
      EXECUTE format(
        'CREATE TRIGGER %I
           AFTER INSERT OR UPDATE OF approval_status ON ems.%I
           FOR EACH ROW
           EXECUTE FUNCTION ems.create_approval_request_from_row()',
        'trg_ems_' || tbl || '_approval_queue',
        tbl
      );
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION ems.can_review_approval(
  p_user_id BIGINT,
  p_company_id BIGINT
)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM app_auth.user_roles ur
    JOIN app_auth.roles r ON r.id = ur.role_id
    WHERE ur.user_id = p_user_id
      AND ur.is_active = TRUE
      AND r.is_active = TRUE
      AND r.name IN (
        'PLATFORM_ADMIN',
        'COMPANY_ADMIN',
        'TENANT_ADMIN',
        'ACADEMIC_MANAGER',
        'BRANCH_ADMIN'
      )
      AND (
        r.name = 'PLATFORM_ADMIN'
        OR ur.company_id = p_company_id
      )
  );
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION ems.review_approval_request(
  p_request_id BIGINT,
  p_reviewer_id BIGINT,
  p_decision VARCHAR,
  p_note TEXT DEFAULT NULL
)
RETURNS ems.approval_requests AS $$
DECLARE
  req ems.approval_requests;
  normalized_decision VARCHAR(30);
  set_sql TEXT;
  has_is_published BOOLEAN;
  has_is_active BOOLEAN;
  has_published_by BOOLEAN;
  has_published_at BOOLEAN;
  reviewed_req ems.approval_requests;
BEGIN
  normalized_decision := UPPER(TRIM(p_decision));

  IF normalized_decision NOT IN ('APPROVED', 'REJECTED', 'CHANGES_REQUESTED') THEN
    RAISE EXCEPTION 'Invalid approval decision: %. Use APPROVED, REJECTED or CHANGES_REQUESTED.', p_decision;
  END IF;

  SELECT *
  INTO req
  FROM ems.approval_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Approval request % not found.', p_request_id;
  END IF;

  IF req.current_status <> 'PENDING' THEN
    RAISE EXCEPTION 'Approval request % is already %.', p_request_id, req.current_status;
  END IF;

  IF NOT ems.can_review_approval(p_reviewer_id, req.company_id) THEN
    RAISE EXCEPTION 'User % cannot review approval request % for company %.', p_reviewer_id, p_request_id, req.company_id;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = req.entity_schema
      AND table_name = req.entity_table
      AND column_name = 'is_published'
  ) INTO has_is_published;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = req.entity_schema
      AND table_name = req.entity_table
      AND column_name = 'is_active'
  ) INTO has_is_active;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = req.entity_schema
      AND table_name = req.entity_table
      AND column_name = 'published_by'
  ) INTO has_published_by;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = req.entity_schema
      AND table_name = req.entity_table
      AND column_name = 'published_at'
  ) INTO has_published_at;

  set_sql := 'approval_status = $1, approved_by = $2, approved_at = $3, approval_notes = $4, rejection_reason = $5, updated_at = NOW()';

  IF normalized_decision = 'APPROVED' AND req.action_type = 'PUBLISH' AND has_is_published THEN
    set_sql := set_sql || ', is_published = TRUE';
  END IF;

  IF normalized_decision = 'APPROVED' AND has_published_by THEN
    set_sql := set_sql || ', published_by = $2';
  END IF;

  IF normalized_decision = 'APPROVED' AND has_published_at THEN
    set_sql := set_sql || ', published_at = $3';
  END IF;

  IF normalized_decision = 'REJECTED' AND has_is_active THEN
    set_sql := set_sql || ', is_active = FALSE';
  END IF;

  EXECUTE format(
    'UPDATE %I.%I SET %s WHERE id = $6 AND company_id = $7',
    req.entity_schema,
    req.entity_table,
    set_sql
  )
  USING
    normalized_decision,
    p_reviewer_id,
    NOW(),
    p_note,
    CASE WHEN normalized_decision = 'APPROVED' THEN NULL ELSE p_note END,
    req.entity_id,
    req.company_id;

  UPDATE ems.approval_requests
  SET
    current_status = normalized_decision,
    reviewed_by = p_reviewer_id,
    reviewed_at = NOW(),
    review_note = p_note,
    rejection_reason = CASE WHEN normalized_decision = 'APPROVED' THEN NULL ELSE p_note END,
    decision_values = jsonb_build_object(
      'decision', normalized_decision,
      'reviewed_by', p_reviewer_id,
      'reviewed_at', NOW(),
      'note', p_note
    ),
    updated_at = NOW()
  WHERE id = p_request_id
  RETURNING *
  INTO reviewed_req;

  RETURN reviewed_req;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 06. TENANT-SCOPED DELETE PROTECTION
-- ============================================================================

DO $$
DECLARE
  tbl TEXT;
  protected_tables TEXT[] := ARRAY[
    'students',
    'tutors',
    'courses',
    'course_modules',
    'lessons',
    'course_materials',
    'batches',
    'student_enrollments',
    'assignments',
    'assignment_submissions',
    'quizzes',
    'quiz_attempts',
    'live_classes',
    'attendance_sessions',
    'attendance_records',
    'certificates',
    'announcements',
    'tutor_announcements'
  ];
BEGIN
  FOREACH tbl IN ARRAY protected_tables LOOP
    IF EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'ems'
        AND table_name = tbl
    ) THEN
      EXECUTE format('ALTER TABLE ems.%I ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ', tbl);
      EXECUTE format('ALTER TABLE ems.%I ADD COLUMN IF NOT EXISTS deleted_by BIGINT REFERENCES app_auth.users(id)', tbl);
      EXECUTE format('ALTER TABLE ems.%I ADD COLUMN IF NOT EXISTS delete_reason TEXT', tbl);
      EXECUTE format(
        'CREATE INDEX IF NOT EXISTS %I ON ems.%I(deleted_at)',
        'idx_ems_' || tbl || '_deleted_at',
        tbl
      );
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION ems.can_delete_ems_record(
  p_user_id BIGINT,
  p_company_id BIGINT
)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM app_auth.user_roles ur
    JOIN app_auth.roles r ON r.id = ur.role_id
    WHERE ur.user_id = p_user_id
      AND ur.is_active = TRUE
      AND r.is_active = TRUE
      AND r.name IN ('PLATFORM_ADMIN', 'COMPANY_ADMIN', 'TENANT_ADMIN')
      AND (
        r.name = 'PLATFORM_ADMIN'
        OR ur.company_id = p_company_id
      )
  );
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION ems.secure_soft_delete(
  p_table_name TEXT,
  p_record_id BIGINT,
  p_deleted_by BIGINT,
  p_reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_company_id BIGINT;
  has_is_active BOOLEAN;
  update_sql TEXT;
BEGIN
  IF p_table_name !~ '^[a-z_]+$' THEN
    RAISE EXCEPTION 'Invalid EMS table name: %', p_table_name;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'ems'
      AND table_name = p_table_name
  ) THEN
    RAISE EXCEPTION 'EMS table %.% not found.', 'ems', p_table_name;
  END IF;

  EXECUTE format('SELECT company_id FROM ems.%I WHERE id = $1', p_table_name)
  INTO v_company_id
  USING p_record_id;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'EMS record %.% not found or has no company_id.', p_table_name, p_record_id;
  END IF;

  IF NOT ems.can_delete_ems_record(p_deleted_by, v_company_id) THEN
    RAISE EXCEPTION 'User % cannot delete EMS record %.% for company %.', p_deleted_by, p_table_name, p_record_id, v_company_id;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'ems'
      AND table_name = p_table_name
      AND column_name = 'is_active'
  ) INTO has_is_active;

  update_sql := 'UPDATE ems.%I SET deleted_at = NOW(), deleted_by = $1, delete_reason = $2, updated_at = NOW()';

  IF has_is_active THEN
    update_sql := update_sql || ', is_active = FALSE';
  END IF;

  update_sql := update_sql || ' WHERE id = $3 AND company_id = $4';

  EXECUTE format(update_sql, p_table_name)
  USING p_deleted_by, p_reason, p_record_id, v_company_id;

  INSERT INTO ems.approval_requests (
    company_id,
    entity_schema,
    entity_table,
    entity_type,
    entity_id,
    action_type,
    current_status,
    requested_by,
    reviewed_by,
    reviewed_at,
    review_note,
    decision_values
  ) VALUES (
    v_company_id,
    'ems',
    p_table_name,
    p_table_name,
    p_record_id,
    'DELETE',
    'APPROVED',
    p_deleted_by,
    p_deleted_by,
    NOW(),
    p_reason,
    jsonb_build_object('deleted_by', p_deleted_by, 'reason', p_reason, 'deleted_at', NOW())
  );

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION ems.block_hard_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Hard delete blocked on ems.%. Use ems.secure_soft_delete(...) with TENANT_ADMIN permission.', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  tbl TEXT;
  protected_tables TEXT[] := ARRAY[
    'students',
    'tutors',
    'courses',
    'course_modules',
    'lessons',
    'course_materials',
    'batches',
    'student_enrollments',
    'assignments',
    'assignment_submissions',
    'quizzes',
    'quiz_attempts',
    'live_classes',
    'attendance_sessions',
    'attendance_records',
    'certificates',
    'announcements',
    'tutor_announcements'
  ];
BEGIN
  FOREACH tbl IN ARRAY protected_tables LOOP
    IF EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'ems'
        AND table_name = tbl
    ) THEN
      EXECUTE format(
        'DROP TRIGGER IF EXISTS %I ON ems.%I',
        'trg_ems_' || tbl || '_block_hard_delete',
        tbl
      );
      EXECUTE format(
        'CREATE TRIGGER %I
           BEFORE DELETE ON ems.%I
           FOR EACH ROW
           EXECUTE FUNCTION ems.block_hard_delete()',
        'trg_ems_' || tbl || '_block_hard_delete',
        tbl
      );
    END IF;
  END LOOP;
END $$;

-- ============================================================================
-- 07. EMS MENU REGISTRY + ROLE MENU ACCESS
-- ============================================================================

CREATE TABLE IF NOT EXISTS app_auth.role_menu_permissions (
  id BIGSERIAL PRIMARY KEY,
  role_id BIGINT NOT NULL REFERENCES app_auth.roles(id) ON DELETE CASCADE,
  menu_id BIGINT NOT NULL REFERENCES app_auth.menu_registry(id) ON DELETE CASCADE,
  is_visible BOOLEAN DEFAULT TRUE,
  can_access BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(role_id, menu_id)
);

DROP TRIGGER IF EXISTS update_role_menu_permissions_updated_at ON app_auth.role_menu_permissions;
CREATE TRIGGER update_role_menu_permissions_updated_at
  BEFORE UPDATE ON app_auth.role_menu_permissions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE app_auth.menu_registry
  ADD COLUMN IF NOT EXISTS required_module VARCHAR(50),
  ADD COLUMN IF NOT EXISTS min_plan_level INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS module_key VARCHAR(50),
  ADD COLUMN IF NOT EXISTS is_core BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS requires_subscription BOOLEAN DEFAULT TRUE;

-- Rename/align old LMS menu rows into EMS module access where they exist.
UPDATE app_auth.menu_registry
SET
  product = 'EMS',
  required_module = 'EMS',
  module_key = 'EMS',
  updated_at = NOW()
WHERE product = 'LMS'
   OR required_module = 'LMS'
   OR module_key = 'LMS'
   OR menu_key ILIKE '%lms%'
   OR route ILIKE '%/lms/%';

UPDATE app_auth.menu_registry
SET
  route = REPLACE(route, '/workspace/lms', '/workspace/ems'),
  updated_at = NOW()
WHERE route ILIKE '%/workspace/lms%';

WITH ems_menus(menu_key, menu_name, display_name, icon, route, sort_order, min_plan_level, description) AS (
  VALUES
    ('ems.dashboard', 'EMS Dashboard', 'Dashboard', 'LayoutDashboard', '/workspace/ems', 10, 1, 'EMS dashboard'),
    ('ems.students', 'EMS Students', 'Students', 'GraduationCap', '/workspace/ems/students', 20, 1, 'Student management'),
    ('ems.tutors', 'EMS Tutors', 'Tutors', 'Users', '/workspace/ems/tutors', 30, 1, 'Tutor management'),
    ('ems.courses', 'EMS Courses', 'Courses', 'BookOpen', '/workspace/ems/courses', 40, 1, 'Course builder and curriculum'),
    ('ems.batches', 'EMS Batches', 'Batches', 'Layers', '/workspace/ems/batches', 50, 1, 'Batch management'),
    ('ems.materials', 'EMS Resources', 'Resources', 'FolderOpen', '/workspace/ems/resources', 60, 1, 'Books and learning resources'),
    ('ems.assignments', 'EMS Assignments', 'Assignments', 'ClipboardCheck', '/workspace/ems/assignments', 70, 1, 'Assignments and submissions'),
    ('ems.quizzes', 'EMS Quizzes', 'Quizzes', 'ListChecks', '/workspace/ems/quizzes', 80, 1, 'Quiz engine'),
    ('ems.live_classes', 'EMS Live Classes', 'Live Classes', 'Video', '/workspace/ems/live-classes', 90, 1, 'Live class scheduling and joining'),
    ('ems.attendance', 'EMS Attendance', 'Attendance', 'CalendarCheck', '/workspace/ems/attendance', 100, 1, 'Attendance sessions and records'),
    ('ems.doubts', 'EMS Doubts', 'Doubts', 'MessagesSquare', '/workspace/ems/doubts', 110, 1, 'Student doubt management'),
    ('ems.approvals', 'EMS Approvals', 'Approvals', 'ShieldCheck', '/workspace/ems/approvals', 120, 1, 'Central approval queue'),
    ('ems.certificates', 'EMS Certificates', 'Certificates', 'Award', '/workspace/ems/certificates', 130, 2, 'Certificate issue and approval'),
    ('ems.reports', 'EMS Reports', 'Reports', 'BarChart3', '/workspace/ems/reports', 140, 1, 'Academic reports'),
    ('ems.settings', 'EMS Settings', 'Settings', 'Settings', '/workspace/ems/settings', 150, 2, 'EMS tenant settings')
)
INSERT INTO app_auth.menu_registry (
  menu_name,
  menu_key,
  display_name,
  description,
  icon,
  route,
  parent_menu_id,
  sort_order,
  product,
  required_module,
  module_key,
  is_core,
  requires_subscription,
  min_plan_level,
  is_active
)
SELECT
  menu_name,
  menu_key,
  display_name,
  description,
  icon,
  route,
  NULL,
  sort_order,
  'EMS',
  'EMS',
  'EMS',
  FALSE,
  TRUE,
  min_plan_level,
  TRUE
FROM ems_menus
ON CONFLICT (menu_key) DO UPDATE SET
  menu_name = EXCLUDED.menu_name,
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  route = EXCLUDED.route,
  parent_menu_id = EXCLUDED.parent_menu_id,
  sort_order = EXCLUDED.sort_order,
  product = 'EMS',
  required_module = 'EMS',
  module_key = 'EMS',
  is_core = EXCLUDED.is_core,
  requires_subscription = EXCLUDED.requires_subscription,
  min_plan_level = EXCLUDED.min_plan_level,
  is_active = TRUE,
  updated_at = NOW();

-- Menu visibility by role.
INSERT INTO app_auth.role_menu_permissions (role_id, menu_id, is_visible, can_access)
SELECT r.id, m.id, TRUE, TRUE
FROM app_auth.roles r
JOIN app_auth.menu_registry m ON m.product = 'EMS'
WHERE r.name IN ('PLATFORM_ADMIN', 'COMPANY_ADMIN', 'TENANT_ADMIN')
ON CONFLICT (role_id, menu_id) DO UPDATE SET
  is_visible = TRUE,
  can_access = TRUE,
  updated_at = NOW();

INSERT INTO app_auth.role_menu_permissions (role_id, menu_id, is_visible, can_access)
SELECT r.id, m.id, TRUE, TRUE
FROM app_auth.roles r
JOIN app_auth.menu_registry m ON m.menu_key = ANY (ARRAY[
  'ems.dashboard',
  'ems.students',
  'ems.tutors',
  'ems.courses',
  'ems.batches',
  'ems.materials',
  'ems.assignments',
  'ems.quizzes',
  'ems.live_classes',
  'ems.attendance',
  'ems.doubts',
  'ems.approvals',
  'ems.certificates',
  'ems.reports'
])
WHERE r.name IN ('ACADEMIC_MANAGER', 'BRANCH_ADMIN')
ON CONFLICT (role_id, menu_id) DO UPDATE SET
  is_visible = TRUE,
  can_access = TRUE,
  updated_at = NOW();

INSERT INTO app_auth.role_menu_permissions (role_id, menu_id, is_visible, can_access)
SELECT r.id, m.id, TRUE, TRUE
FROM app_auth.roles r
JOIN app_auth.menu_registry m ON m.menu_key = ANY (ARRAY[
  'ems.dashboard',
  'ems.students',
  'ems.courses',
  'ems.batches',
  'ems.materials',
  'ems.assignments',
  'ems.quizzes',
  'ems.live_classes',
  'ems.attendance',
  'ems.doubts',
  'ems.reports'
])
WHERE r.name = 'TUTOR'
ON CONFLICT (role_id, menu_id) DO UPDATE SET
  is_visible = TRUE,
  can_access = TRUE,
  updated_at = NOW();

INSERT INTO app_auth.role_menu_permissions (role_id, menu_id, is_visible, can_access)
SELECT r.id, m.id, TRUE, TRUE
FROM app_auth.roles r
JOIN app_auth.menu_registry m ON m.menu_key = ANY (ARRAY[
  'ems.dashboard',
  'ems.courses',
  'ems.materials',
  'ems.assignments',
  'ems.quizzes',
  'ems.live_classes',
  'ems.attendance',
  'ems.doubts',
  'ems.certificates'
])
WHERE r.name = 'STUDENT'
ON CONFLICT (role_id, menu_id) DO UPDATE SET
  is_visible = TRUE,
  can_access = TRUE,
  updated_at = NOW();

-- Hide owner/admin-only menus from tutor/student if old rows granted them before.
UPDATE app_auth.role_menu_permissions rmp
SET is_visible = FALSE, can_access = FALSE, updated_at = NOW()
FROM app_auth.roles r, app_auth.menu_registry m
WHERE rmp.role_id = r.id
  AND rmp.menu_id = m.id
  AND r.name IN ('TUTOR', 'STUDENT')
  AND m.menu_key IN ('ems.approvals', 'ems.settings');

-- ============================================================================
-- 08. LMS -> EMS NAMING ALIGNMENT FOR SUBSCRIPTION DATA
-- ============================================================================

UPDATE core.subscription_plans
SET
  enabled_modules = (
    SELECT jsonb_agg(DISTINCT module_name)
    FROM (
      SELECT CASE WHEN value::TEXT = '"LMS"' THEN '"EMS"'::JSONB ELSE value END AS module_name
      FROM jsonb_array_elements(COALESCE(enabled_modules, '[]'::jsonb))
      UNION ALL
      SELECT '"EMS"'::JSONB
    ) modules
  ),
  updated_at = NOW()
WHERE COALESCE(enabled_modules, '[]'::jsonb) ? 'LMS'
   OR NOT (COALESCE(enabled_modules, '[]'::jsonb) ? 'EMS');

UPDATE core.companies
SET
  enabled_modules = (
    SELECT jsonb_agg(DISTINCT module_name)
    FROM (
      SELECT CASE WHEN value::TEXT = '"LMS"' THEN '"EMS"'::JSONB ELSE value END AS module_name
      FROM jsonb_array_elements(COALESCE(enabled_modules, '[]'::jsonb))
      UNION ALL
      SELECT '"EMS"'::JSONB
    ) modules
  ),
  updated_at = NOW()
WHERE COALESCE(enabled_modules, '[]'::jsonb) ? 'LMS'
   OR NOT (COALESCE(enabled_modules, '[]'::jsonb) ? 'EMS');

-- ============================================================================
-- 09. AUDIT COMMENTS
-- ============================================================================

COMMENT ON TABLE ems.approval_requests IS
  'Central tenant-scoped EMS approval queue for course/content/batch/class/attendance/certificate workflow.';

COMMENT ON FUNCTION ems.review_approval_request(BIGINT, BIGINT, VARCHAR, TEXT) IS
  'Reviews one EMS approval request. Reviewer must be tenant/company/platform admin or academic approval role inside the same company.';

COMMENT ON FUNCTION ems.secure_soft_delete(TEXT, BIGINT, BIGINT, TEXT) IS
  'Tenant-scoped EMS soft delete helper. Only PLATFORM_ADMIN, COMPANY_ADMIN or TENANT_ADMIN can delete.';

COMMIT;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================
-- SELECT name, level, product FROM app_auth.roles WHERE product = 'EMS' ORDER BY level DESC;
-- SELECT action, COUNT(*) FROM app_auth.permissions WHERE product = 'EMS' GROUP BY action ORDER BY action;
-- SELECT current_status, COUNT(*) FROM ems.approval_requests GROUP BY current_status;
-- SELECT r.name, COUNT(*) FROM app_auth.role_menu_permissions rmp JOIN app_auth.roles r ON r.id = rmp.role_id WHERE r.name IN ('TENANT_ADMIN','ACADEMIC_MANAGER','TUTOR','STUDENT') GROUP BY r.name;
