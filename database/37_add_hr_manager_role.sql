-- ============================================================================
-- Add HR_MANAGER role for HR Manager Portal
-- Run this in Supabase SQL Editor
-- ============================================================================

INSERT INTO app_auth.roles (name, display_name, description, role_type, product, level, is_system_role, is_active)
VALUES (
    'HR_MANAGER',
    'HR Manager',
    'Manages tutors, students, enrollments, attendance and bulk import operations for the HR portal.',
    'CUSTOM',
    'EMS',
    3,
    FALSE,
    TRUE
)
ON CONFLICT (name) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    level = EXCLUDED.level,
    updated_at = NOW();
