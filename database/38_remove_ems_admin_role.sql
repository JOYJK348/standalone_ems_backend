-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- Migration 38: Remove EMS_ADMIN Role
-- 
-- EMS_ADMIN was originally level 2 (PRODUCT_ADMIN), then upgraded to level 3.
-- It became redundant after ACADEMIC_MANAGER (level 3) was added — both have
-- identical permissions and menus.
-- 
-- This migration:
--   1. Migrates any users with EMS_ADMIN → ACADEMIC_MANAGER
--   2. Cleans up all role_x refs for EMS_ADMIN
--   3. Deletes the EMS_ADMIN role
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

BEGIN;

-- 1. Migrate existing user_roles assignments
UPDATE app_auth.user_roles ur
SET role_id = (SELECT id FROM app_auth.roles WHERE name = 'ACADEMIC_MANAGER')
WHERE role_id = (SELECT id FROM app_auth.roles WHERE name = 'EMS_ADMIN');

-- 2. Delete role_menu_permissions for EMS_ADMIN
DELETE FROM app_auth.role_menu_permissions
WHERE role_id = (SELECT id FROM app_auth.roles WHERE name = 'EMS_ADMIN');

-- 3. Delete role_permissions for EMS_ADMIN
DELETE FROM app_auth.role_permissions
WHERE role_id = (SELECT id FROM app_auth.roles WHERE name = 'EMS_ADMIN');

-- 4. Delete the role itself
DELETE FROM app_auth.roles WHERE name = 'EMS_ADMIN';

COMMIT;
