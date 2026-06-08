-- ============================================================================
-- COMPREHENSIVE MENU PERMISSIONS FIX
-- 
-- Run AFTER: 30_ems_rbac_approval_hardening.sql AND 33_dynamic_roles_seed.sql
-- 
-- This script ensures ALL menu keys used by API routes exist in menu_registry
-- AND are assigned to appropriate roles.
-- ============================================================================

BEGIN;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 1. Create ALL missing menu keys used by routes
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

WITH parent_ids AS (
  SELECT id, menu_key FROM app_auth.menu_registry WHERE menu_key IN (
    'ems.dashboard', 'ems.students', 'ems.courses', 'ems.quizzes', 'ems.attendance',
    'ems.assignments', 'ems.tutors', 'ems.batches', 'ems.materials', 'ems.live_classes',
    'ems.reports', 'ems.certificates', 'ems.settings', 'ems.enrollments', 'ems.doubts',
    'ems.face_profile', 'ems.practice', 'ems.progress', 'ems.analytics', 'ems.approvals',
    'ems.tutor'
  )
),
new_menus(menu_key, menu_name, display_name, parent_key, sort_offset) AS (
  VALUES
    -- Dashboard sub-menus
    ('ems.dashboard.student',  'Student Dashboard',          'Student Dashboard',     'ems.dashboard',   1),
    ('ems.dashboard.tutor',    'Tutor Dashboard',            'Tutor Dashboard',       'ems.dashboard',   2),
    ('ems.dashboard.mapping',  'Dashboard Course Mapping',   'Course Mapping',        'ems.dashboard',   3),

    -- Students sub-menus (additional)
    ('ems.students.assignments',     'Student Assignments',       'Student Assignments',    'ems.students',    20),
    ('ems.students.assignments.view', 'View Assignment',         'View Assignment',        'ems.students',    21),
    ('ems.students.assignments.submit', 'Submit Assignment',     'Submit Assignment',      'ems.students',    22),
    ('ems.students.materials',   'Student Materials',       'Student Materials',      'ems.students',    25),
    ('ems.students.quizzes',     'Student Quizzes',         'Student Quizzes',        'ems.students',    30),
    ('ems.students.quizzes.view',   'View Quiz',              'View Quiz',              'ems.students',    31),
    ('ems.students.quizzes.start',  'Start Quiz',             'Start Quiz',             'ems.students',    32),
    ('ems.students.quizzes.submit', 'Submit Quiz',            'Submit Quiz',            'ems.students',    33),
    ('ems.students.quizzes.questions', 'Quiz Questions',      'Quiz Questions',         'ems.students',    34),

    -- Quizzes sub-menus (additional)
    ('ems.quizzes.attempts',          'Quiz Attempts',              'Quiz Attempts',            'ems.quizzes',    15),
    ('ems.quizzes.attempts.recent',   'Recent Attempts',           'Recent Attempts',          'ems.quizzes',    16),

    -- Attendance sub-menus (additional)
    ('ems.attendance.class',    'Class Attendance',      'Class Attendance',       'ems.attendance',  10),
    ('ems.attendance.verify',   'Verify Attendance',     'Verify Attendance',      'ems.attendance',  15),

    -- Assignments sub-menus (additional)
    ('ems.assignments.submit',      'Submit Assignment',       'Submit Assignment',       'ems.assignments', 15),
    ('ems.assignments.submissions', 'View Submissions',        'View Submissions',        'ems.assignments', 20),

    -- Enrollments
    ('ems.enrollments',         'Enrollments',           'Enrollments',            NULL,              1),
    ('ems.enrollments.edit',    'Edit Enrollment',       'Edit Enrollment',        'ems.enrollments', 5),

    -- Courses sub-menus (additional)
    ('ems.courses.tutors.assign', 'Assign Tutors',        'Assign Tutors',          'ems.courses',     15),

    -- Tutor sub-menus
    ('ems.tutor.students',    'Tutor Students',        'Tutor Students',          'ems.tutor',        5),
    ('ems.tutor.submissions', 'Tutor Submissions',     'Tutor Submissions',       'ems.tutor',       10),

    -- Face profile
    ('ems.face_profile',           'Face Profile',              'Face Profile',             NULL,              1),
    ('ems.face_profile.register',  'Register Face',            'Register Face',            'ems.face_profile',  5),
    ('ems.face_profile.verify',    'Verify Face',              'Verify Face',              'ems.face_profile', 10),

    -- Content
    ('ems.content.lessons',     'Lessons',               'Lessons',                NULL,              1),
    ('ems.content.lessons.edit','Edit Lesson',           'Edit Lesson',            'ems.content.lessons', 5),
    ('ems.content.modules',     'Modules',               'Modules',                NULL,              1),

    -- Practice
    ('ems.practice',             'Practice',                  'Practice',                 NULL,              1),
    ('ems.practice.dashboard',   'Practice Dashboard',        'Practice Dashboard',       'ems.practice',     5),
    ('ems.practice.allocate',    'Allocate Practice',         'Allocate Practice',        'ems.practice',    10),
    ('ems.practice.gst',         'GST Practice',              'GST Practice',             'ems.practice',    15),
    ('ems.practice.gst.invoice', 'GST Invoice Practice',      'GST Invoice Practice',     'ems.practice',    16),
    ('ems.practice.it',          'IT Practice',               'IT Practice',              'ems.practice',    20),
    ('ems.practice.tds',         'TDS Practice',              'TDS Practice',             'ems.practice',    25),
    ('ems.practice.reset',       'Reset Practice',            'Reset Practice',           'ems.practice',    30),
    ('ems.practice.status',      'Practice Status',           'Practice Status',          'ems.practice',    35),

    -- Live classes sub-menus (additional)
    ('ems.live_classes.status', 'Live Class Status',     'Live Class Status',       'ems.live_classes', 10),

    -- Progress / Analytics
    ('ems.progress',             'Progress',                  'Progress',                 NULL,              1)
)
INSERT INTO app_auth.menu_registry (
  menu_name, menu_key, display_name, description, icon, route,
  parent_menu_id, sort_order, product, required_module, module_key,
  is_core, requires_subscription, is_active
)
SELECT
  nm.menu_name, nm.menu_key, nm.display_name,
  nm.display_name,
  COALESCE(
    (SELECT icon FROM app_auth.menu_registry WHERE menu_key = nm.parent_key LIMIT 1),
    'Circle'
  ),
  COALESCE(
    (SELECT route FROM app_auth.menu_registry WHERE menu_key = nm.parent_key LIMIT 1),
    '/workspace/ems'
  ) || '/' || LOWER(REPLACE(nm.menu_key, 'ems.', '')),
  p.id,
  nm.sort_offset,
  'EMS', 'EMS', 'EMS',
  FALSE, TRUE, TRUE
FROM new_menus nm
LEFT JOIN parent_ids p ON nm.parent_key = p.menu_key
WHERE NOT EXISTS (
  SELECT 1 FROM app_auth.menu_registry mr WHERE mr.menu_key = nm.menu_key
)
ON CONFLICT (menu_key) DO NOTHING;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 2. Grant ALL EMS menus to admin roles
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

INSERT INTO app_auth.role_menu_permissions (role_id, menu_id, is_visible, can_access)
SELECT r.id, m.id, TRUE, TRUE
FROM app_auth.roles r
JOIN app_auth.menu_registry m ON m.product = 'EMS' AND m.is_active = TRUE
WHERE r.name IN ('PLATFORM_ADMIN', 'COMPANY_ADMIN', 'TENANT_ADMIN', 'ACADEMIC_MANAGER', 'BRANCH_ADMIN')
  AND NOT EXISTS (
    SELECT 1 FROM app_auth.role_menu_permissions rmp
    WHERE rmp.role_id = r.id AND rmp.menu_id = m.id
  )
ON CONFLICT (role_id, menu_id) DO NOTHING;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3. Grant sub-menus to TUTOR role
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

INSERT INTO app_auth.role_menu_permissions (role_id, menu_id, is_visible, can_access)
SELECT r.id, m.id, TRUE, TRUE
FROM app_auth.roles r
JOIN app_auth.menu_registry m ON m.product = 'EMS' AND m.is_active = TRUE
  AND m.menu_key = ANY (ARRAY[
    'ems.dashboard', 'ems.dashboard.tutor',
    'ems.students', 'ems.students.profile',
    'ems.courses', 'ems.batches',
    'ems.materials', 'ems.assignments', 'ems.quizzes',
    'ems.quizzes.attempts', 'ems.quizzes.attempts.recent',
    'ems.live_classes', 'ems.attendance',
    'ems.attendance.mark', 'ems.attendance.class',
    'ems.doubts', 'ems.reports', 'ems.reports.progress',
    'ems.enrollments',
    'ems.tutor.students', 'ems.tutor.submissions'
  ])
WHERE r.name = 'TUTOR'
  AND NOT EXISTS (
    SELECT 1 FROM app_auth.role_menu_permissions rmp
    WHERE rmp.role_id = r.id AND rmp.menu_id = m.id
  )
ON CONFLICT (role_id, menu_id) DO NOTHING;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 4. Grant sub-menus to STUDENT role
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

INSERT INTO app_auth.role_menu_permissions (role_id, menu_id, is_visible, can_access)
SELECT r.id, m.id, TRUE, TRUE
FROM app_auth.roles r
JOIN app_auth.menu_registry m ON m.product = 'EMS' AND m.is_active = TRUE
  AND m.menu_key = ANY (ARRAY[
    'ems.dashboard', 'ems.dashboard.student',
    'ems.courses', 'ems.materials',
    'ems.assignments', 'ems.assignments.submit',
    'ems.quizzes', 'ems.quizzes.attempts', 'ems.quizzes.attempts.recent',
    'ems.live_classes', 'ems.attendance',
    'ems.doubts', 'ems.certificates',
    'ems.students', 'ems.students.profile', 'ems.students.courses',
    'ems.students.assignments', 'ems.students.assignments.view', 'ems.students.assignments.submit',
    'ems.students.materials',
    'ems.students.quizzes', 'ems.students.quizzes.view', 'ems.students.quizzes.start', 'ems.students.quizzes.submit', 'ems.students.quizzes.questions',
    'ems.progress', 'ems.face_profile', 'ems.face_profile.register', 'ems.face_profile.verify',
    'ems.enrollments',
    'ems.practice', 'ems.practice.dashboard', 'ems.practice.allocate',
    'ems.practice.gst', 'ems.practice.gst.invoice', 'ems.practice.it',
    'ems.practice.tds', 'ems.practice.reset', 'ems.practice.status'
  ])
WHERE r.name = 'STUDENT'
  AND NOT EXISTS (
    SELECT 1 FROM app_auth.role_menu_permissions rmp
    WHERE rmp.role_id = r.id AND rmp.menu_id = m.id
  )
ON CONFLICT (role_id, menu_id) DO NOTHING;

COMMIT;
