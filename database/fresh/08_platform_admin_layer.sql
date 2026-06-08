-- ============================================================================
-- LAYER 1: PLATFORM ADMIN
-- Durkkas internal control plane for all tenants, subscriptions, health,
-- menu licensing, impersonation, audit and emergency actions.
-- ============================================================================

BEGIN;

CREATE SCHEMA IF NOT EXISTS platform;

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS platform.tenant_module_access (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
  module_key VARCHAR(80) NOT NULL,
  is_enabled BOOLEAN DEFAULT TRUE,
  enabled_by BIGINT REFERENCES app_auth.users(id) ON DELETE SET NULL,
  disabled_by BIGINT REFERENCES app_auth.users(id) ON DELETE SET NULL,
  reason TEXT,
  starts_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, module_key)
);

CREATE TABLE IF NOT EXISTS platform.tenant_menu_access (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
  menu_id BIGINT NOT NULL REFERENCES app_auth.menu_registry(id) ON DELETE CASCADE,
  is_enabled BOOLEAN DEFAULT TRUE,
  min_plan_level INTEGER DEFAULT 0,
  granted_by BIGINT REFERENCES app_auth.users(id) ON DELETE SET NULL,
  revoked_by BIGINT REFERENCES app_auth.users(id) ON DELETE SET NULL,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, menu_id)
);

CREATE TABLE IF NOT EXISTS platform.tenant_resource_usage (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
  usage_date DATE NOT NULL DEFAULT CURRENT_DATE,
  active_users INTEGER DEFAULT 0,
  total_students INTEGER DEFAULT 0,
  total_tutors INTEGER DEFAULT 0,
  api_calls BIGINT DEFAULT 0,
  storage_bytes BIGINT DEFAULT 0,
  active_sessions INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, usage_date)
);

CREATE TABLE IF NOT EXISTS platform.health_checks (
  id BIGSERIAL PRIMARY KEY,
  service_key VARCHAR(100) NOT NULL,
  service_name VARCHAR(255) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'UNKNOWN',
  latency_ms INTEGER,
  error_message TEXT,
  checked_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb,
  CONSTRAINT chk_platform_health_status CHECK (status IN ('UP', 'DOWN', 'DEGRADED', 'UNKNOWN'))
);

CREATE TABLE IF NOT EXISTS platform.system_event_logs (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT REFERENCES core.companies(id) ON DELETE SET NULL,
  severity VARCHAR(30) NOT NULL DEFAULT 'INFO',
  event_type VARCHAR(120) NOT NULL,
  message TEXT NOT NULL,
  source VARCHAR(120),
  actor_user_id BIGINT REFERENCES app_auth.users(id) ON DELETE SET NULL,
  target_type VARCHAR(120),
  target_id BIGINT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT chk_platform_event_severity CHECK (severity IN ('DEBUG', 'INFO', 'WARN', 'ERROR', 'CRITICAL'))
);

CREATE TABLE IF NOT EXISTS platform.impersonation_sessions (
  id BIGSERIAL PRIMARY KEY,
  platform_user_id BIGINT NOT NULL REFERENCES app_auth.users(id) ON DELETE CASCADE,
  impersonated_user_id BIGINT NOT NULL REFERENCES app_auth.users(id) ON DELETE CASCADE,
  company_id BIGINT REFERENCES core.companies(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  ended_by BIGINT REFERENCES app_auth.users(id) ON DELETE SET NULL,
  ip_address INET,
  user_agent TEXT,
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS platform.emergency_actions (
  id BIGSERIAL PRIMARY KEY,
  action_type VARCHAR(80) NOT NULL,
  company_id BIGINT REFERENCES core.companies(id) ON DELETE SET NULL,
  target_user_id BIGINT REFERENCES app_auth.users(id) ON DELETE SET NULL,
  requested_by BIGINT NOT NULL REFERENCES app_auth.users(id) ON DELETE RESTRICT,
  approved_by BIGINT REFERENCES app_auth.users(id) ON DELETE SET NULL,
  mfa_confirmed BOOLEAN DEFAULT FALSE,
  status VARCHAR(30) DEFAULT 'PENDING',
  reason TEXT NOT NULL,
  executed_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT chk_platform_emergency_status CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'EXECUTED', 'CANCELLED'))
);

CREATE INDEX IF NOT EXISTS idx_platform_tenant_module_company ON platform.tenant_module_access(company_id, module_key);
CREATE INDEX IF NOT EXISTS idx_platform_tenant_menu_company ON platform.tenant_menu_access(company_id, menu_id);
CREATE INDEX IF NOT EXISTS idx_platform_usage_company_date ON platform.tenant_resource_usage(company_id, usage_date DESC);
CREATE INDEX IF NOT EXISTS idx_platform_events_company_time ON platform.system_event_logs(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_impersonation_company ON platform.impersonation_sessions(company_id, started_at DESC);

DROP TRIGGER IF EXISTS update_platform_tenant_module_access_updated_at ON platform.tenant_module_access;
CREATE TRIGGER update_platform_tenant_module_access_updated_at BEFORE UPDATE ON platform.tenant_module_access FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_platform_tenant_menu_access_updated_at ON platform.tenant_menu_access;
CREATE TRIGGER update_platform_tenant_menu_access_updated_at BEFORE UPDATE ON platform.tenant_menu_access FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_platform_tenant_resource_usage_updated_at ON platform.tenant_resource_usage;
CREATE TRIGGER update_platform_tenant_resource_usage_updated_at BEFORE UPDATE ON platform.tenant_resource_usage FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_platform_emergency_actions_updated_at ON platform.emergency_actions;
CREATE TRIGGER update_platform_emergency_actions_updated_at BEFORE UPDATE ON platform.emergency_actions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMIT;
