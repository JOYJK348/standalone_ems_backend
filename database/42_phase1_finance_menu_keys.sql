-- ============================================================================
-- PHASE 1: Finance Menu Keys for New Tables
-- Run AFTER: 41_phase1_coaching_finance.sql
--
-- Adds menu keys for expenses, installments, discounts, late fee config
-- and grants them to FINANCE_MANAGER role.
-- ============================================================================

BEGIN;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 1. Add finance sub-menu keys for Phase 1 features
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

WITH parent AS (
  SELECT id FROM app_auth.menu_registry WHERE menu_key = 'ems.finance' LIMIT 1
),
new_keys (menu_key, menu_name, display_name, sort_offset, route_path) AS (
  VALUES
    ('ems.finance.expenses',         'Expenses',         'Expenses',         20, '/ems/finance/expenses'),
    ('ems.finance.installments',     'Installments',     'Installments',     25, '/ems/finance/installments'),
    ('ems.finance.discounts',        'Discounts',        'Discounts',        30, '/ems/finance/discounts'),
    ('ems.finance.late_fee',         'Late Fee Config',  'Late Fee Config',  35, '/ems/finance/late-fee')
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

COMMIT;
