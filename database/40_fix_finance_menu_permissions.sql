-- ============================================================================
-- FIX FINANCE MANAGER MENU PERMISSIONS
--
-- Run AFTER: 35_fix_all_menu_permissions.sql AND 39_grant_invoices_permissions.sql
--
-- Adds missing finance menu keys (ems.finance.invoices, ems.finance.payments,
-- ems.finance.fees) into menu_registry and grants them to FINANCE_MANAGER role,
-- plus grants all EMS menus to FINANCE_MANAGER for full access.
-- ============================================================================

BEGIN;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 1. Ensure finance parent menus exist in menu_registry
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

INSERT INTO app_auth.menu_registry (menu_name, menu_key, display_name, description, icon, route, parent_menu_id, sort_order, product, required_module, module_key, is_core, requires_subscription, is_active)
SELECT 'Finance', 'ems.finance', 'Finance', 'Finance management', 'Wallet', '/ems/finance', NULL, 1, 'EMS', 'EMS', 'EMS', FALSE, TRUE, TRUE
WHERE NOT EXISTS (SELECT 1 FROM app_auth.menu_registry WHERE menu_key = 'ems.finance');

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 2. Add finance sub-menu keys used by API routes
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

WITH parent AS (
  SELECT id FROM app_auth.menu_registry WHERE menu_key = 'ems.finance' LIMIT 1
),
new_keys (menu_key, menu_name, display_name, sort_offset, route_path) AS (
  VALUES
    ('ems.finance.invoices',  'Invoices',  'Invoices',  5,  '/ems/finance/invoices'),
    ('ems.finance.payments',  'Payments',  'Payments',  10, '/ems/finance/payments'),
    ('ems.finance.fees',      'Fees',      'Fees',      15, '/ems/finance/fees')
)
INSERT INTO app_auth.menu_registry (menu_name, menu_key, display_name, description, icon, route, parent_menu_id, sort_order, product, required_module, module_key, is_core, requires_subscription, is_active)
SELECT
  nk.menu_name, nk.menu_key, nk.display_name, nk.display_name,
  'Circle', nk.route_path, p.id, nk.sort_offset,
  'EMS', 'EMS', 'EMS', FALSE, TRUE, TRUE
FROM new_keys nk
CROSS JOIN parent p
WHERE NOT EXISTS (
  SELECT 1 FROM app_auth.menu_registry mr WHERE mr.menu_key = nk.menu_key
)
ON CONFLICT (menu_key) DO NOTHING;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3. Grant ALL EMS menus to FINANCE_MANAGER role
--    (so all finance sub-menus + dashboard + reports are accessible)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

INSERT INTO app_auth.role_menu_permissions (role_id, menu_id, is_visible, can_access)
SELECT r.id, m.id, TRUE, TRUE
FROM app_auth.roles r
JOIN app_auth.menu_registry m ON m.product = 'EMS' AND m.is_active = TRUE
WHERE r.name = 'FINANCE_MANAGER'
  AND NOT EXISTS (
    SELECT 1 FROM app_auth.role_menu_permissions rmp
    WHERE rmp.role_id = r.id AND rmp.menu_id = m.id
  )
ON CONFLICT (role_id, menu_id) DO NOTHING;

COMMIT;
