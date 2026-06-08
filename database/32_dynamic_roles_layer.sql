-- ============================================================================
-- DYNAMIC ROLES LAYER — Tenant-created custom roles with Menu ID assignment
-- 
-- This layer adds:
--   1. ems.dynamic_roles        → Tenant-created roles with menu_ids[]
--   2. ems.dynamic_user_roles   → User-to-dynamic-role assignments
--   3. get_user_menu_ids()      → RPC to get all menu IDs for a user
--   4. Pre-built role templates → Finance Manager, HR Manager, etc.
-- ============================================================================

BEGIN;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 1. DYNAMIC ROLES (Tenant-created custom roles)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS ems.dynamic_roles (
    id          BIGSERIAL PRIMARY KEY,
    company_id  BIGINT NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
    role_name   VARCHAR(100) NOT NULL,
    description TEXT,
    menu_ids    TEXT[] NOT NULL DEFAULT '{}',
    is_active   BOOLEAN DEFAULT TRUE,
    created_by  BIGINT REFERENCES app_auth.users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, role_name)
);

COMMENT ON TABLE ems.dynamic_roles IS 'Tenant-created dynamic roles with menu ID assignments';
COMMENT ON COLUMN ems.dynamic_roles.menu_ids IS 'Array of menu_key values from app_auth.menu_registry';

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 2. DYNAMIC USER ROLES (User-to-dynamic-role assignments)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS ems.dynamic_user_roles (
    id          BIGSERIAL PRIMARY KEY,
    user_id     BIGINT NOT NULL REFERENCES app_auth.users(id) ON DELETE CASCADE,
    role_id     BIGINT NOT NULL REFERENCES ems.dynamic_roles(id) ON DELETE CASCADE,
    company_id  BIGINT NOT NULL,
    is_active   BOOLEAN DEFAULT TRUE,
    assigned_by BIGINT REFERENCES app_auth.users(id) ON DELETE SET NULL,
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, role_id, company_id)
);

COMMENT ON TABLE ems.dynamic_user_roles IS 'User assignments to dynamic roles';

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3. RPC: Get all menu IDs for a user (system roles + dynamic roles)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE OR REPLACE FUNCTION ems.get_user_menu_ids(
    p_user_id    BIGINT,
    p_company_id BIGINT DEFAULT NULL
) RETURNS TEXT[] AS $$
DECLARE
    v_menu_ids TEXT[];
BEGIN
    -- 1. Get menu IDs from system roles (via app_auth.role_menu_permissions)
    WITH system_menus AS (
        SELECT DISTINCT mr.menu_key
        FROM app_auth.user_roles ur
        JOIN app_auth.role_menu_permissions rmp ON ur.role_id = rmp.role_id
        JOIN app_auth.menu_registry mr ON rmp.menu_id = mr.id
        WHERE ur.user_id = p_user_id
          AND ur.is_active = TRUE
          AND mr.is_active = TRUE
          AND (p_company_id IS NULL OR ur.company_id = p_company_id OR ur.company_id IS NULL)
    ),
    -- 2. Get menu IDs from dynamic roles
    dynamic_menus AS (
        SELECT DISTINCT UNNEST(dr.menu_ids) AS menu_key
        FROM ems.dynamic_user_roles dur
        JOIN ems.dynamic_roles dr ON dur.role_id = dr.id
        WHERE dur.user_id = p_user_id
          AND dur.is_active = TRUE
          AND dr.is_active = TRUE
          AND dur.company_id = COALESCE(p_company_id, dur.company_id)
    )
    SELECT ARRAY(
        SELECT menu_key FROM system_menus
        UNION
        SELECT menu_key FROM dynamic_menus
    ) INTO v_menu_ids;

    RETURN COALESCE(v_menu_ids, '{}');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION ems.get_user_menu_ids IS 'Returns all menu keys accessible to a user (system + dynamic roles)';

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 4. Pre-built dynamic role templates
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_ems_dynamic_roles_company ON ems.dynamic_roles(company_id, is_active);
CREATE INDEX IF NOT EXISTS idx_ems_dynamic_user_roles_user ON ems.dynamic_user_roles(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_ems_dynamic_user_roles_role ON ems.dynamic_user_roles(role_id, is_active);

-- TRIGGER for updated_at
DROP TRIGGER IF EXISTS update_ems_dynamic_roles_updated_at ON ems.dynamic_roles;
CREATE TRIGGER update_ems_dynamic_roles_updated_at
    BEFORE UPDATE ON ems.dynamic_roles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMIT;
