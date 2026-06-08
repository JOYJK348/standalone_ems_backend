-- Migration 45: Add due tracking menu key

-- Insert the menu entry
INSERT INTO app_auth.menu_registry (menu_name, menu_key, display_name, description, icon, route, parent_menu_id, sort_order, product, required_module, module_key, is_core, requires_subscription, is_active)
SELECT 'Due Tracking', 'ems.finance.due_tracking', 'Due Tracking', 'Track and manage fee dues', 'Bell', '/ems/dynamic-role/finance-manager/due-tracking', p.id, 20, 'EMS', 'EMS', 'EMS', FALSE, TRUE, TRUE
FROM app_auth.menu_registry p WHERE p.menu_key = 'ems.finance'
ON CONFLICT (menu_key) DO NOTHING;

-- Grant to FINANCE_MANAGER role
INSERT INTO app_auth.role_menu_permissions (role_id, menu_id, is_visible, can_access)
SELECT r.id, m.id, TRUE, TRUE
FROM app_auth.roles r
JOIN app_auth.menu_registry m ON m.menu_key = 'ems.finance.due_tracking'
WHERE r.name = 'FINANCE_MANAGER'
  AND NOT EXISTS (
    SELECT 1 FROM app_auth.role_menu_permissions rmp
    WHERE rmp.role_id = r.id AND rmp.menu_id = m.id
  )
ON CONFLICT (role_id, menu_id) DO NOTHING;
