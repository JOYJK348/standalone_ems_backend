-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 21 - PLATFORM SETTINGS & BRANDING SCHEMA
-- Durkkas Innovations Private Limited
-- Platform Configuration, Branding, and User Profile Updates
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 1. PLATFORM BRANDING TABLE
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SET search_path TO core, app_auth, public;

-- Platform-level branding (global)
CREATE TABLE IF NOT EXISTS core.platform_branding (
    id BIGSERIAL PRIMARY KEY,
    
    -- Basic Info
    platform_name VARCHAR(255) NOT NULL DEFAULT 'Durkkas ERP',
    tagline VARCHAR(500),
    
    -- Asset URLs
    logo_url TEXT,
    favicon_url TEXT,
    dark_logo_url TEXT,
    
    -- Colors
    primary_color VARCHAR(20) DEFAULT '#0066FF',
    secondary_color VARCHAR(20) DEFAULT '#0052CC',
    accent_color VARCHAR(20) DEFAULT '#00C853',
    
    -- Footer/Legal
    copyright_text VARCHAR(500),
    support_url TEXT,
    terms_url TEXT,
    privacy_url TEXT,
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    
    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by BIGINT REFERENCES app_auth.users(id),
    updated_by BIGINT REFERENCES app_auth.users(id)
);

COMMENT ON TABLE core.platform_branding IS 'Global platform branding settings';

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 2. COMPANY BRANDING TABLE
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- Company-specific branding (per tenant)
CREATE TABLE IF NOT EXISTS core.company_branding (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
    
    -- Assets
    logo_url TEXT,
    favicon_url TEXT,
    dark_logo_url TEXT,
    
    -- Colors
    primary_color VARCHAR(20),
    secondary_color VARCHAR(20),
    accent_color VARCHAR(20),
    
    -- Custom Texts
    login_message TEXT,
    footer_text VARCHAR(500),
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    
    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by BIGINT REFERENCES app_auth.users(id),
    updated_by BIGINT REFERENCES app_auth.users(id),
    
    -- Soft Delete
    deleted_at TIMESTAMPTZ,
    deleted_by BIGINT REFERENCES app_auth.users(id),
    delete_reason TEXT,
    
    UNIQUE(company_id)
);

COMMENT ON TABLE core.company_branding IS 'Company-specific branding for white-labeling';

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3. ADD SOFT DELETE TO AUTH.USERS (For is_deleted tracking)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SET search_path TO app_auth, public;

ALTER TABLE app_auth.users 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS deleted_by BIGINT,
ADD COLUMN IF NOT EXISTS delete_reason TEXT;

-- Add profile fields if not exist
ALTER TABLE app_auth.users 
ADD COLUMN IF NOT EXISTS phone_number VARCHAR(20),
ADD COLUMN IF NOT EXISTS timezone VARCHAR(100) DEFAULT 'Asia/Kolkata',
ADD COLUMN IF NOT EXISTS date_format VARCHAR(20) DEFAULT 'DD/MM/YYYY';

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 4. USER SESSIONS TABLE (For IP Tracking & Multi-Device)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS app_auth.user_sessions (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES app_auth.users(id) ON DELETE CASCADE,
    
    -- Session Info
    session_token TEXT UNIQUE,
    refresh_token TEXT,
    
    -- Device Info
    device_type VARCHAR(50), -- MOBILE, DESKTOP, TABLET
    device_name VARCHAR(255),
    browser VARCHAR(100),
    os VARCHAR(100),
    
    -- Network
    ip_address INET,
    location VARCHAR(255), -- City, Country (from IP)
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    last_active_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    logged_out_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON app_auth.user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON app_auth.user_sessions(session_token);

COMMENT ON TABLE app_auth.user_sessions IS 'Active user sessions with device and IP tracking';

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 5. USER ACTIVITY LOG (Detailed Activity Tracking)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE TABLE IF NOT EXISTS app_auth.user_activity_log (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES app_auth.users(id) ON DELETE CASCADE,
    session_id BIGINT REFERENCES app_auth.user_sessions(id),
    
    -- Action Details
    action VARCHAR(100) NOT NULL, -- LOGIN, LOGOUT, PROFILE_UPDATE, PASSWORD_CHANGE, etc.
    action_category VARCHAR(50), -- AUTH, PROFILE, SECURITY, DATA
    description TEXT,
    
    -- Context
    resource_type VARCHAR(100),
    resource_id VARCHAR(100),
    
    -- Network Info
    ip_address INET,
    user_agent TEXT,
    device_type VARCHAR(50),
    
    -- Additional Data
    metadata JSONB,
    
    -- Timestamp
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_activity_user_id ON app_auth.user_activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_user_activity_action ON app_auth.user_activity_log(action);
CREATE INDEX IF NOT EXISTS idx_user_activity_created_at ON app_auth.user_activity_log(created_at DESC);

COMMENT ON TABLE app_auth.user_activity_log IS 'Detailed user activity log for security and audit';

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 6. ADD MORE TRACKED COLUMNS TO EXISTING TABLES
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- Add enabled_modules as JSONB to companies if not exists
SET search_path TO core, public;

ALTER TABLE core.companies 
ADD COLUMN IF NOT EXISTS enabled_modules JSONB DEFAULT '["HRMS"]'::jsonb,
ADD COLUMN IF NOT EXISTS branding_config JSONB,
ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS deleted_by BIGINT,
ADD COLUMN IF NOT EXISTS delete_reason TEXT;

-- Add soft delete columns to employees table
ALTER TABLE core.employees
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS deleted_by BIGINT,
ADD COLUMN IF NOT EXISTS delete_reason TEXT;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 7. CREATE TRIGGER FOR AUTOMATIC updated_at
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to users table
DROP TRIGGER IF EXISTS trigger_users_updated_at ON app_auth.users;
CREATE TRIGGER trigger_users_updated_at
    BEFORE UPDATE ON app_auth.users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Apply trigger to companies table
DROP TRIGGER IF EXISTS trigger_companies_updated_at ON core.companies;
CREATE TRIGGER trigger_companies_updated_at
    BEFORE UPDATE ON core.companies
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Apply trigger to platform_branding
DROP TRIGGER IF EXISTS trigger_platform_branding_updated_at ON core.platform_branding;
CREATE TRIGGER trigger_platform_branding_updated_at
    BEFORE UPDATE ON core.platform_branding
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Apply trigger to company_branding
DROP TRIGGER IF EXISTS trigger_company_branding_updated_at ON core.company_branding;
CREATE TRIGGER trigger_company_branding_updated_at
    BEFORE UPDATE ON core.company_branding
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 8. INSERT DEFAULT PLATFORM BRANDING
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

INSERT INTO core.platform_branding (
    platform_name,
    tagline,
    primary_color,
    secondary_color,
    copyright_text,
    support_url
) VALUES (
    'Durkkas ERP',
    'Advanced Enterprise Architecture',
    '#0066FF',
    '#0052CC',
    '© 2026 Durkkas Academy. All Rights Reserved.',
    'https://support.durkkas.com'
) ON CONFLICT DO NOTHING;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 9. GRANT PERMISSIONS
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

GRANT ALL ON core.platform_branding TO authenticated;
GRANT ALL ON core.company_branding TO authenticated;
GRANT ALL ON app_auth.user_sessions TO authenticated;
GRANT ALL ON app_auth.user_activity_log TO authenticated;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA core TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA app_auth TO authenticated;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- VERIFICATION
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DO $$
BEGIN
    RAISE NOTICE '✅ Platform Settings & Branding Schema Created!';
    RAISE NOTICE '📊 Tables Created:';
    RAISE NOTICE '   - core.platform_branding (Global platform branding)';
    RAISE NOTICE '   - core.company_branding (Company-specific branding)';
    RAISE NOTICE '   - app_auth.user_sessions (Session & IP tracking)';
    RAISE NOTICE '   - app_auth.user_activity_log (Detailed activity log)';
    RAISE NOTICE '🔧 Columns Added:';
    RAISE NOTICE '   - app_auth.users: phone_number, timezone, soft delete';
    RAISE NOTICE '   - core.companies: enabled_modules, branding_config, settings, soft delete';
    RAISE NOTICE '   - core.employees: soft delete (deleted_at, deleted_by, delete_reason)';
    RAISE NOTICE '⚡ Triggers: Auto-update updated_at on all tables';
    RAISE NOTICE '🗑️ Soft Delete: All entity deletions are recoverable with audit trail';
END $$;
