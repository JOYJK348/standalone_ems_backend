-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 02 - AUTH SCHEMA (MULTI-TENANT AUTHENTICATION & AUTHORIZATION)
-- Durkkas Innovations Private Limited
-- Multi-Tenant SaaS | Production-Ready | Enterprise Grade | High Security
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- Drop and Recreate Schema (CAUTION: This will delete ALL data in app_auth)
DROP SCHEMA IF EXISTS app_auth CASCADE;
CREATE SCHEMA app_auth;

-- Set Search Path
SET search_path TO app_auth, core, public;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 1. USERS (AUTHENTICATION)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS app_auth.users (
    id BIGSERIAL PRIMARY KEY,
    
    -- Authentication
    email VARCHAR(255) NOT NULL UNIQUE,
    phone VARCHAR(20) UNIQUE,
    password_hash TEXT NOT NULL,
    
    -- Profile
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    display_name VARCHAR(255),
    avatar_url TEXT,
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    is_verified BOOLEAN DEFAULT FALSE,
    is_locked BOOLEAN DEFAULT FALSE,
    
    -- Security
    failed_login_attempts INTEGER DEFAULT 0,
    last_login_at TIMESTAMPTZ,
    last_login_ip INET,
    password_changed_at TIMESTAMPTZ,
    
    -- MFA (Multi-Factor Authentication)
    mfa_enabled BOOLEAN DEFAULT FALSE,
    mfa_secret TEXT,
    
    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by BIGINT,
    updated_by BIGINT
);

COMMENT ON TABLE app_auth.users IS 'User accounts for authentication';
COMMENT ON COLUMN app_auth.users.password_hash IS 'Bcrypt hashed password (NEVER store plain text)';
COMMENT ON COLUMN app_auth.users.is_locked IS 'Account locked after multiple failed login attempts';

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 2. ROLES (MULTI-TENANT AUTHORIZATION)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS app_auth.roles (
    id BIGSERIAL PRIMARY KEY,
    
    -- Role Details
    name VARCHAR(100) NOT NULL UNIQUE,
    display_name VARCHAR(255),
    description TEXT,
    
    -- Role Type
    role_type VARCHAR(50) DEFAULT 'CUSTOM',  -- PLATFORM, COMPANY, PRODUCT, BRANCH, CUSTOM
    product VARCHAR(50),  -- HRMS, EMS, CRM, FINANCE, BACKOFFICE
    
    -- Hierarchy (CRITICAL FOR MULTI-TENANT)
    level INTEGER DEFAULT 0,  
    -- 5 = PLATFORM_ADMIN (Durkkas Team - Access ALL companies)
    -- 4 = COMPANY_ADMIN (Customer Admin - Access ONLY their company)
    -- 2 = PRODUCT_ADMIN (HRMS_ADMIN - Product-specific)
    -- 1 = BRANCH_ADMIN (Branch-level access)
    -- 0 = REGULAR_USER (Basic access)
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    is_system_role BOOLEAN DEFAULT FALSE,
    
    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by BIGINT,
    updated_by BIGINT
);

COMMENT ON TABLE app_auth.roles IS 'Role definitions for multi-tenant RBAC';
COMMENT ON COLUMN app_auth.roles.level IS 'Role hierarchy: 5=Platform, 4=Company, 2=Product, 1=Branch, 0=User';

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3. PERMISSIONS (GRANULAR ACCESS CONTROL)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS app_auth.permissions (
    id BIGSERIAL PRIMARY KEY,
    
    -- Permission Details
    name VARCHAR(255) NOT NULL UNIQUE,  -- e.g., platform.companies.create, company.users.manage
    display_name VARCHAR(255),
    description TEXT,
    
    -- Categorization
    permission_scope VARCHAR(50),  -- PLATFORM, COMPANY, PRODUCT
    schema_name VARCHAR(50),  -- core, hrms, ems, crm, finance, backoffice
    resource VARCHAR(100),  -- companies, employees, students, invoices
    action VARCHAR(50),  -- view, create, edit, delete, approve
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    
    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by BIGINT,
    updated_by BIGINT
);

COMMENT ON TABLE app_auth.permissions IS 'Granular permissions for RBAC';
COMMENT ON COLUMN app_auth.permissions.permission_scope IS 'PLATFORM (all companies) vs COMPANY (single company)';

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 4. ROLE_PERMISSIONS (MANY-TO-MANY)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS app_auth.role_permissions (
    id BIGSERIAL PRIMARY KEY,
    role_id BIGINT NOT NULL REFERENCES app_auth.roles(id) ON DELETE CASCADE,
    permission_id BIGINT NOT NULL REFERENCES app_auth.permissions(id) ON DELETE CASCADE,
    
    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by BIGINT,
    
    UNIQUE(role_id, permission_id)
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 5. USER_ROLES (MULTI-TENANT SCOPE ASSIGNMENT)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS app_auth.user_roles (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES app_auth.users(id) ON DELETE CASCADE,
    role_id BIGINT NOT NULL REFERENCES app_auth.roles(id) ON DELETE CASCADE,
    
    -- MULTI-TENANT SCOPE (CRITICAL!)
    company_id BIGINT,  -- NULL = Platform Admin (access all companies)
                        -- NOT NULL = Company-scoped (access only this company)
    branch_id BIGINT,   -- Optional: Further restrict to specific branch
    
    -- Validity Period
    valid_from DATE,
    valid_until DATE,
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    
    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by BIGINT,
    updated_by BIGINT,
    
    UNIQUE(user_id, role_id, company_id, branch_id)
);

COMMENT ON TABLE app_auth.user_roles IS 'User-role assignments with multi-tenant scope';
COMMENT ON COLUMN app_auth.user_roles.company_id IS 'NULL=Platform Admin, NOT NULL=Company-scoped';

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 6. MULTI-TENANT SECURITY VALIDATION
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- Trigger function to ensure Company Admins (Level 4) have a company assigned
CREATE OR REPLACE FUNCTION app_auth.validate_user_role_scope()
RETURNS TRIGGER AS $$
DECLARE
    v_role_level INTEGER;
BEGIN
    -- Get the level of the role being assigned
    SELECT level INTO v_role_level FROM app_auth.roles WHERE id = NEW.role_id;

    -- If role level is 4 (COMPANY_ADMIN), company_id must NOT be NULL
    IF v_role_level = 4 AND NEW.company_id IS NULL THEN
        RAISE EXCEPTION 'Security Error: Company Admin (Level 4) must be assigned to a specific company_id.';
    END IF;

    -- If role level is 5 (PLATFORM_ADMIN), company_id should typically be NULL (access all)
    -- But we allow it if specifically assigned to one company for testing

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_user_role_scope ON app_auth.user_roles;
CREATE TRIGGER trg_validate_user_role_scope
BEFORE INSERT OR UPDATE ON app_auth.user_roles
FOR EACH ROW EXECUTE FUNCTION app_auth.validate_user_role_scope();

COMMENT ON FUNCTION app_auth.validate_user_role_scope IS 'Security: Validates that Company Admins are assigned to a specific company';

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 7. MENU_REGISTRY (NAVIGATION CONTROL)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS app_auth.menu_registry (
    id BIGSERIAL PRIMARY KEY,
    
    -- Menu Details
    menu_name VARCHAR(255) NOT NULL,
    menu_key VARCHAR(100) NOT NULL UNIQUE,
    display_name VARCHAR(255),
    description TEXT,
    
    -- Hierarchy
    parent_menu_id BIGINT REFERENCES app_auth.menu_registry(id),
    sort_order INTEGER DEFAULT 0,
    
    -- Product Mapping
    product VARCHAR(50),  -- HRMS, EMS, CRM, FINANCE, BACKOFFICE
    schema_name VARCHAR(50),
    
    -- Frontend Routing
    route VARCHAR(500),
    icon VARCHAR(100),
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    is_visible BOOLEAN DEFAULT TRUE,
    
    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by BIGINT,
    updated_by BIGINT
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 8. MENU_PERMISSIONS (MENU ACCESS CONTROL)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS app_auth.menu_permissions (
    id BIGSERIAL PRIMARY KEY,
    menu_id BIGINT NOT NULL REFERENCES app_auth.menu_registry(id) ON DELETE CASCADE,
    permission_id BIGINT NOT NULL REFERENCES app_auth.permissions(id) ON DELETE CASCADE,
    
    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by BIGINT,
    
    UNIQUE(menu_id, permission_id)
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 9. AUDIT LOGS (SECURITY TRAIL)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS app_auth.audit_logs (
    id BIGSERIAL PRIMARY KEY,
    
    -- Who
    user_id BIGINT REFERENCES app_auth.users(id) ON DELETE SET NULL,
    user_email VARCHAR(255),
    company_id BIGINT,  -- Track which company's data was accessed
    
    -- What
    action VARCHAR(100) NOT NULL,  -- CREATE, UPDATE, DELETE, LOGIN, LOGOUT
    resource_type VARCHAR(100),
    resource_id BIGINT,
    
    -- Where
    schema_name VARCHAR(50),
    table_name VARCHAR(100),
    
    -- Details
    old_values JSONB,
    new_values JSONB,
    changes JSONB,
    
    -- Context
    ip_address INET,
    user_agent TEXT,
    
    -- When
    created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE app_auth.audit_logs IS 'Security audit trail for all critical actions';
COMMENT ON COLUMN app_auth.audit_logs.company_id IS 'Track which company data was accessed (multi-tenant audit)';

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 10. LOGIN_HISTORY (AUTHENTICATION AUDIT)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS app_auth.login_history (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES app_auth.users(id) ON DELETE SET NULL,
    email VARCHAR(255),
    login_status VARCHAR(50),  -- SUCCESS, FAILED, LOCKED, MFA_REQUIRED
    failure_reason TEXT,
    ip_address INET,
    user_agent TEXT,
    device_type VARCHAR(50),
    logged_in_at TIMESTAMPTZ DEFAULT NOW()
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- INDEXES (PERFORMANCE CRITICAL)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE INDEX IF NOT EXISTS idx_users_email ON app_auth.users(email);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON app_auth.users(is_active);
CREATE INDEX IF NOT EXISTS idx_roles_level ON app_auth.roles(level);
CREATE INDEX IF NOT EXISTS idx_permissions_name ON app_auth.permissions(name);
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON app_auth.user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_company_id ON app_auth.user_roles(company_id);  -- CRITICAL for tenant filtering
CREATE INDEX IF NOT EXISTS idx_audit_logs_company_id ON app_auth.audit_logs(company_id);  -- Audit by company
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON app_auth.audit_logs(created_at);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- TRIGGERS
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE OR REPLACE FUNCTION app_auth.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at
DO $$
DECLARE
    t text;
BEGIN
    FOR t IN 
        SELECT table_name 
        FROM information_schema.columns 
        WHERE table_schema = 'app_auth' 
        AND column_name = 'updated_at'
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS update_%I_updated_at ON app_auth.%I', t, t);
        EXECUTE format('CREATE TRIGGER update_%I_updated_at BEFORE UPDATE ON app_auth.%I FOR EACH ROW EXECUTE FUNCTION app_auth.update_updated_at_column()', t, t);
    END LOOP;
END $$;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- MULTI-TENANT HELPER FUNCTIONS (CRITICAL FOR SECURITY)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- Function: Get user's tenant scope
CREATE OR REPLACE FUNCTION app_auth.get_user_tenant_scope(p_user_id BIGINT)
RETURNS TABLE(
    company_id BIGINT,
    branch_id BIGINT,
    role_level INTEGER,
    role_name VARCHAR,
    role_type VARCHAR
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ur.company_id,
        ur.branch_id,
        r.level,
        r.name,
        r.role_type
    FROM app_auth.user_roles ur
    JOIN app_auth.roles r ON ur.role_id = r.id
    WHERE ur.user_id = p_user_id
      AND ur.is_active = TRUE
      AND (ur.valid_from IS NULL OR ur.valid_from <= CURRENT_DATE)
      AND (ur.valid_until IS NULL OR ur.valid_until >= CURRENT_DATE)
    ORDER BY r.level DESC
    LIMIT 1;  -- Return highest role
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION app_auth.get_user_tenant_scope IS 
'Returns user highest role and company scope for multi-tenant filtering';

-- Function: Check if user can access company
CREATE OR REPLACE FUNCTION app_auth.can_access_company(
    p_user_id BIGINT,
    p_company_id BIGINT
)
RETURNS BOOLEAN AS $$
DECLARE
    v_scope RECORD;
BEGIN
    SELECT * INTO v_scope 
    FROM app_auth.get_user_tenant_scope(p_user_id);
    
    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;
    
    -- Platform Admin (Level 5+): Can access ALL companies
    IF v_scope.role_level >= 5 THEN
        RETURN TRUE;
    END IF;
    
    -- Company Admin (Level 4): Can only access their assigned company
    IF v_scope.role_level = 4 THEN
        RETURN v_scope.company_id = p_company_id;
    END IF;
    
    -- Others: Check company assignment
    RETURN v_scope.company_id = p_company_id OR v_scope.company_id IS NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION app_auth.can_access_company IS 
'Security check: Returns TRUE if user can access the specified company';

-- Function: Get user permissions
CREATE OR REPLACE FUNCTION app_auth.get_user_permissions(p_user_id BIGINT)
RETURNS TABLE(permission_name VARCHAR) AS $$
BEGIN
    RETURN QUERY
    SELECT DISTINCT p.name
    FROM app_auth.user_roles ur
    JOIN app_auth.role_permissions rp ON ur.role_id = rp.role_id
    JOIN app_auth.permissions p ON rp.permission_id = p.id
    WHERE ur.user_id = p_user_id
      AND ur.is_active = TRUE
      AND p.is_active = TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Check if user has permission
CREATE OR REPLACE FUNCTION app_auth.user_has_permission(
    p_user_id BIGINT,
    p_permission_name VARCHAR
)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 
        FROM app_auth.get_user_permissions(p_user_id)
        WHERE permission_name = p_permission_name
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- BOOTSTRAP DATA (MULTI-TENANT ROLES & PERMISSIONS)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- Step 1: Create Multi-Tenant Admin Roles
INSERT INTO app_auth.roles (name, display_name, description, role_type, level, is_system_role) VALUES
('PLATFORM_ADMIN', 'Platform Administrator', 'Durkkas Team - Platform Owner - Can manage all companies, products, and modules', 'PLATFORM', 5, TRUE),
('COMPANY_ADMIN', 'Company Administrator', 'Customer Admin - Company Owner - Can manage only their assigned company', 'COMPANY', 4, TRUE)
ON CONFLICT (name) DO NOTHING;

-- Step 2: Create Product Admin Roles
INSERT INTO app_auth.roles (name, display_name, description, role_type, product, level, is_system_role) VALUES
('HRMS_ADMIN', 'HRMS Administrator', 'Manages HRMS module', 'PRODUCT', 'HRMS', 2, TRUE),
('CRM_ADMIN', 'CRM Administrator', 'Manages CRM module', 'PRODUCT', 'CRM', 2, TRUE),
('FINANCE_ADMIN', 'Finance Administrator', 'Manages Finance module', 'PRODUCT', 'FINANCE', 2, TRUE)
ON CONFLICT (name) DO NOTHING;

-- Step 3: Create Platform-Level Permissions
INSERT INTO app_auth.permissions (name, display_name, description, permission_scope, schema_name, resource, action) VALUES
-- Platform Admin Permissions
('platform.companies.create', 'Create Companies', 'Create new companies in the platform', 'PLATFORM', 'core', 'companies', 'create'),
('platform.companies.delete', 'Delete Companies', 'Delete companies from the platform', 'PLATFORM', 'core', 'companies', 'delete'),
('platform.companies.view_all', 'View All Companies', 'View all companies across platform', 'PLATFORM', 'core', 'companies', 'view_all'),
('platform.users.view_all', 'View All Users', 'View users across all companies', 'PLATFORM', 'auth', 'users', 'view_all'),
('platform.settings.manage', 'Manage Platform Settings', 'Manage global platform settings', 'PLATFORM', 'core', 'settings', 'manage'),

-- Company Admin Permissions
('company.users.manage', 'Manage Company Users', 'Manage users within own company', 'COMPANY', 'auth', 'users', 'manage'),
('company.branches.manage', 'Manage Branches', 'Manage branches within own company', 'COMPANY', 'core', 'branches', 'manage'),
('company.departments.manage', 'Manage Departments', 'Manage departments within own company', 'COMPANY', 'core', 'departments', 'manage'),
('company.employees.manage', 'Manage Employees', 'Manage employees within own company', 'COMPANY', 'core', 'employees', 'manage'),
('company.settings.manage', 'Manage Company Settings', 'Manage own company settings', 'COMPANY', 'core', 'settings', 'manage')
ON CONFLICT (name) DO NOTHING;

-- Step 4: Assign Permissions to Roles
-- Platform Admin gets all platform permissions
INSERT INTO app_auth.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM app_auth.roles r
CROSS JOIN app_auth.permissions p
WHERE r.name = 'PLATFORM_ADMIN'
  AND p.permission_scope = 'PLATFORM'
ON CONFLICT DO NOTHING;

-- Company Admin gets all company permissions
INSERT INTO app_auth.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM app_auth.roles r
CROSS JOIN app_auth.permissions p
WHERE r.name = 'COMPANY_ADMIN'
  AND p.permission_scope = 'COMPANY'
ON CONFLICT DO NOTHING;

-- Step 5: Create Default Platform Admin (Durkkas Team)
-- Password: durkkas@2026 (hashed with bcrypt)
INSERT INTO app_auth.users (email, password_hash, first_name, last_name, display_name, is_active, is_verified) 
VALUES (
    'admin@durkkas.com',
    '$2a$10$ay7xaR5Qb5tFDC0V/f5bf.zpwu/RT5bNZPb.i9k890wolYXEyMeaq',
    'Platform',
    'Administrator',
    'Durkkas Platform Admin',
    TRUE,
    TRUE
)
ON CONFLICT (email) DO NOTHING;

-- Step 6: Assign Platform Admin Role (company_id = NULL for platform-wide access)
INSERT INTO app_auth.user_roles (user_id, role_id, company_id)
SELECT 
    u.id,
    r.id,
    NULL  -- NULL = Platform Admin (access all companies)
FROM app_auth.users u
CROSS JOIN app_auth.roles r
WHERE u.email = 'admin@durkkas.com'
  AND r.name = 'PLATFORM_ADMIN'
ON CONFLICT DO NOTHING;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- VERIFICATION
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DO $$
BEGIN
    RAISE NOTICE '✅ Multi-Tenant Auth Schema Created Successfully!';
    RAISE NOTICE '📊 Role Hierarchy: PLATFORM_ADMIN (5) > COMPANY_ADMIN (4)';
    RAISE NOTICE '🔐 Platform Admin: admin@durkkas.com (password: durkkas@2026)';
    RAISE NOTICE '🏢 Multi-Tenant Security: ENABLED';
END $$;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- END OF AUTH SCHEMA
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
