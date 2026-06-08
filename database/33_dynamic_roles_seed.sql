-- ============================================================================
-- DYNAMIC ROLES SEED — Granular menu keys + pre-built role templates
-- 
-- Run AFTER: 32_dynamic_roles_layer.sql
-- ============================================================================

BEGIN;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 1. Add granular menu keys to app_auth.menu_registry
--    These are sub-entity menu keys for API-level granular control
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

WITH parent_ids AS (
  SELECT id, menu_key FROM app_auth.menu_registry WHERE menu_key IN (
    'ems.courses', 'ems.batches', 'ems.students', 'ems.tutors',
    'ems.assignments', 'ems.quizzes', 'ems.live_classes', 'ems.attendance',
    'ems.materials', 'ems.certificates', 'ems.reports', 'ems.dashboard',
    'ems.approvals', 'ems.doubts'
  )
),
new_menus(menu_key, menu_name, display_name, parent_key, sort_offset, icon, route_path) AS (
  VALUES
    -- Courses sub-menus
    ('ems.courses.edit',    'Edit Course',    'Edit Course',    'ems.courses',    5,  'Edit',          '/workspace/ems/courses/edit'),
    ('ems.courses.tutors',  'Course Tutors',  'Course Tutors',  'ems.courses',    10, 'Users',         '/workspace/ems/courses/tutors'),
    
    -- Batches sub-menus
    ('ems.batches.edit',    'Edit Batch',     'Edit Batch',     'ems.batches',    5,  'Edit',          '/workspace/ems/batches/edit'),
    
    -- Students sub-menus
    ('ems.students.edit',   'Edit Student',   'Edit Student',   'ems.students',   5,  'Edit',          '/workspace/ems/students/edit'),
    ('ems.students.profile','Student Profile','Student Profile','ems.students',   10, 'UserCircle',    '/workspace/ems/students/profile'),
    ('ems.students.courses','Student Courses','Student Courses','ems.students',   15, 'BookOpen',      '/workspace/ems/students/courses'),
    
    -- Tutors sub-menus
    ('ems.tutors.edit',     'Edit Tutor',     'Edit Tutor',     'ems.tutors',     5,  'Edit',          '/workspace/ems/tutors/edit'),
    
    -- Assignments sub-menus
    ('ems.assignments.edit','Edit Assignment','Edit Assignment','ems.assignments',5,  'Edit',          '/workspace/ems/assignments/edit'),
    ('ems.assignments.grade','Grade',         'Grade',          'ems.assignments',10, 'CheckCircle',   '/workspace/ems/assignments/grade'),
    
    -- Quizzes sub-menus
    ('ems.quizzes.edit',    'Edit Quiz',      'Edit Quiz',      'ems.quizzes',    5,  'Edit',          '/workspace/ems/quizzes/edit'),
    ('ems.quizzes.questions','Quiz Questions','Quiz Questions', 'ems.quizzes',    10, 'HelpCircle',    '/workspace/ems/quizzes/questions'),
    
    -- Live classes sub-menus
    ('ems.live_classes.edit','Edit Live Class','Edit Live Class','ems.live_classes',5,'Edit',          '/workspace/ems/live-classes/edit'),
    
    -- Materials sub-menus
    ('ems.materials.edit',  'Edit Material',  'Edit Material',  'ems.materials',  5,  'Edit',          '/workspace/ems/materials/edit'),
    
    -- Attendance sub-menus
    ('ems.attendance.mark', 'Mark Attendance','Mark Attendance','ems.attendance', 5,  'CheckSquare',  '/workspace/ems/attendance/mark'),
    
    -- Reports sub-menus
    ('ems.reports.analytics','Analytics',     'Analytics',      'ems.reports',    5,  'BarChart',      '/workspace/ems/reports/analytics'),
    ('ems.reports.progress','Progress Report','Progress Report','ems.reports',    10, 'TrendingUp',   '/workspace/ems/reports/progress')
)
INSERT INTO app_auth.menu_registry (
  menu_name, menu_key, display_name, description, icon, route,
  parent_menu_id, sort_order, product, required_module, module_key,
  is_core, requires_subscription, is_active
)
SELECT
  nm.menu_name, nm.menu_key, nm.display_name,
  nm.display_name, nm.icon, nm.route_path,
  p.id, nm.sort_offset, 'EMS', 'EMS', 'EMS',
  FALSE, TRUE, TRUE
FROM new_menus nm
JOIN parent_ids p ON nm.parent_key = p.menu_key
WHERE NOT EXISTS (
  SELECT 1 FROM app_auth.menu_registry mr WHERE mr.menu_key = nm.menu_key
)
ON CONFLICT (menu_key) DO NOTHING;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 2. Insert role_menu_permissions for all EMS menus to existing system roles
--    This ensures existing system roles get access to their sub-menus too
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- TENANT_ADMIN, COMPANY_ADMIN, PLATFORM_ADMIN get all EMS menus
INSERT INTO app_auth.role_menu_permissions (role_id, menu_id, is_visible, can_access)
SELECT r.id, m.id, TRUE, TRUE
FROM app_auth.roles r
JOIN app_auth.menu_registry m ON m.product = 'EMS' AND m.is_active = TRUE
WHERE r.name IN ('PLATFORM_ADMIN', 'COMPANY_ADMIN', 'TENANT_ADMIN')
  AND NOT EXISTS (
    SELECT 1 FROM app_auth.role_menu_permissions rmp
    WHERE rmp.role_id = r.id AND rmp.menu_id = m.id
  )
ON CONFLICT (role_id, menu_id) DO NOTHING;

-- ACADEMIC_MANAGER, BRANCH_ADMIN get all EMS menus
INSERT INTO app_auth.role_menu_permissions (role_id, menu_id, is_visible, can_access)
SELECT r.id, m.id, TRUE, TRUE
FROM app_auth.roles r
JOIN app_auth.menu_registry m ON m.product = 'EMS' AND m.is_active = TRUE
WHERE r.name IN ('ACADEMIC_MANAGER', 'BRANCH_ADMIN')
  AND NOT EXISTS (
    SELECT 1 FROM app_auth.role_menu_permissions rmp
    WHERE rmp.role_id = r.id AND rmp.menu_id = m.id
  )
ON CONFLICT (role_id, menu_id) DO NOTHING;

-- TUTOR gets academic menus + sub-menus
INSERT INTO app_auth.role_menu_permissions (role_id, menu_id, is_visible, can_access)
SELECT r.id, m.id, TRUE, TRUE
FROM app_auth.roles r
JOIN app_auth.menu_registry m ON m.product = 'EMS' AND m.is_active = TRUE
  AND m.menu_key = ANY (ARRAY[
    'ems.dashboard', 'ems.students', 'ems.students.profile',
    'ems.courses', 'ems.batches',
    'ems.materials', 'ems.assignments', 'ems.quizzes',
    'ems.live_classes', 'ems.attendance', 'ems.doubts',
    'ems.reports', 'ems.reports.progress'
  ])
WHERE r.name = 'TUTOR'
  AND NOT EXISTS (
    SELECT 1 FROM app_auth.role_menu_permissions rmp
    WHERE rmp.role_id = r.id AND rmp.menu_id = m.id
  )
ON CONFLICT (role_id, menu_id) DO NOTHING;

-- STUDENT gets limited menus
INSERT INTO app_auth.role_menu_permissions (role_id, menu_id, is_visible, can_access)
SELECT r.id, m.id, TRUE, TRUE
FROM app_auth.roles r
JOIN app_auth.menu_registry m ON m.product = 'EMS' AND m.is_active = TRUE
  AND m.menu_key = ANY (ARRAY[
    'ems.dashboard',
    'ems.courses', 'ems.materials',
    'ems.assignments', 'ems.quizzes',
    'ems.live_classes', 'ems.attendance',
    'ems.doubts', 'ems.certificates',
    'ems.students', 'ems.students.profile', 'ems.students.courses'
  ])
WHERE r.name = 'STUDENT'
  AND NOT EXISTS (
    SELECT 1 FROM app_auth.role_menu_permissions rmp
    WHERE rmp.role_id = r.id AND rmp.menu_id = m.id
  )
ON CONFLICT (role_id, menu_id) DO NOTHING;

COMMIT;
