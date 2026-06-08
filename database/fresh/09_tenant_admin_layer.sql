-- ============================================================================
-- LAYER 2: TENANT ADMIN
-- One institution control panel: users, roles, menus, invites, settings,
-- billing hooks, announcements and tenant-scoped audit.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS ems.tenant_settings (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE UNIQUE,
  academic_year_start_month INTEGER DEFAULT 6,
  default_timezone VARCHAR(80) DEFAULT 'Asia/Kolkata',
  attendance_mode VARCHAR(40) DEFAULT 'FACE_GPS',
  allow_student_self_enrollment BOOLEAN DEFAULT FALSE,
  require_content_approval BOOLEAN DEFAULT TRUE,
  require_assignment_approval BOOLEAN DEFAULT TRUE,
  require_live_class_approval BOOLEAN DEFAULT TRUE,
  storage_provider VARCHAR(40) DEFAULT 'SUPABASE',
  notification_channels JSONB DEFAULT '["IN_APP"]'::jsonb,
  branding JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT chk_ems_tenant_settings_attendance_mode CHECK (attendance_mode IN ('MANUAL', 'FACE', 'GPS', 'FACE_GPS'))
);

CREATE TABLE IF NOT EXISTS ems.tenant_menu_overrides (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
  menu_id BIGINT NOT NULL REFERENCES app_auth.menu_registry(id) ON DELETE CASCADE,
  is_enabled BOOLEAN DEFAULT TRUE,
  override_reason TEXT,
  changed_by BIGINT REFERENCES app_auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, menu_id)
);

CREATE TABLE IF NOT EXISTS ems.user_invitations (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(30),
  full_name VARCHAR(255),
  role_id BIGINT NOT NULL REFERENCES app_auth.roles(id) ON DELETE RESTRICT,
  invited_by BIGINT REFERENCES app_auth.users(id) ON DELETE SET NULL,
  invitation_token VARCHAR(255) UNIQUE,
  status VARCHAR(30) DEFAULT 'PENDING',
  expires_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb,
  CONSTRAINT chk_ems_user_invitation_status CHECK (status IN ('PENDING', 'ACCEPTED', 'EXPIRED', 'CANCELLED'))
);

CREATE TABLE IF NOT EXISTS ems.announcements (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
  branch_id BIGINT REFERENCES core.branches(id) ON DELETE SET NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  audience_type VARCHAR(40) DEFAULT 'ALL',
  audience_filter JSONB DEFAULT '{}'::jsonb,
  publish_status VARCHAR(30) DEFAULT 'DRAFT',
  scheduled_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  created_by BIGINT REFERENCES app_auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  deleted_by BIGINT REFERENCES app_auth.users(id) ON DELETE SET NULL,
  delete_reason TEXT,
  CONSTRAINT chk_ems_announcement_audience CHECK (audience_type IN ('ALL', 'ROLE', 'BATCH', 'COURSE', 'USER')),
  CONSTRAINT chk_ems_announcement_status CHECK (publish_status IN ('DRAFT', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED'))
);

CREATE INDEX IF NOT EXISTS idx_ems_tenant_menu_overrides_company ON ems.tenant_menu_overrides(company_id, menu_id);
CREATE INDEX IF NOT EXISTS idx_ems_user_invitations_company_status ON ems.user_invitations(company_id, status);
CREATE INDEX IF NOT EXISTS idx_ems_announcements_company_status ON ems.announcements(company_id, publish_status);

DROP TRIGGER IF EXISTS update_ems_tenant_settings_updated_at ON ems.tenant_settings;
CREATE TRIGGER update_ems_tenant_settings_updated_at BEFORE UPDATE ON ems.tenant_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_ems_tenant_menu_overrides_updated_at ON ems.tenant_menu_overrides;
CREATE TRIGGER update_ems_tenant_menu_overrides_updated_at BEFORE UPDATE ON ems.tenant_menu_overrides FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_ems_user_invitations_updated_at ON ems.user_invitations;
CREATE TRIGGER update_ems_user_invitations_updated_at BEFORE UPDATE ON ems.user_invitations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_ems_announcements_updated_at ON ems.announcements;
CREATE TRIGGER update_ems_announcements_updated_at BEFORE UPDATE ON ems.announcements FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMIT;
