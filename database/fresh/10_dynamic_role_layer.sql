-- ============================================================================
-- LAYER 3: DYNAMIC ROLE ADMIN
-- Tenant-created custom roles mapped to menu IDs, permissions and optional
-- data scopes. This is how Finance Manager / Coordinator / Placement Officer
-- style roles work without code changes.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS ems.dynamic_role_templates (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT REFERENCES core.companies(id) ON DELETE CASCADE,
  template_key VARCHAR(120) NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  description TEXT,
  default_menu_keys JSONB DEFAULT '[]'::jsonb,
  default_permission_names JSONB DEFAULT '[]'::jsonb,
  is_platform_template BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  created_by BIGINT REFERENCES app_auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, template_key)
);

CREATE TABLE IF NOT EXISTS ems.role_menu_scope_rules (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
  role_id BIGINT NOT NULL REFERENCES app_auth.roles(id) ON DELETE CASCADE,
  menu_id BIGINT NOT NULL REFERENCES app_auth.menu_registry(id) ON DELETE CASCADE,
  can_view BOOLEAN DEFAULT TRUE,
  can_create BOOLEAN DEFAULT FALSE,
  can_edit BOOLEAN DEFAULT FALSE,
  can_delete BOOLEAN DEFAULT FALSE,
  can_approve BOOLEAN DEFAULT FALSE,
  data_scope VARCHAR(40) DEFAULT 'TENANT',
  scope_filter JSONB DEFAULT '{}'::jsonb,
  configured_by BIGINT REFERENCES app_auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, role_id, menu_id),
  CONSTRAINT chk_ems_role_menu_data_scope CHECK (data_scope IN ('TENANT', 'BRANCH', 'BATCH', 'COURSE', 'ASSIGNED_ONLY', 'OWN_ONLY'))
);

CREATE TABLE IF NOT EXISTS ems.access_preview_snapshots (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
  role_id BIGINT NOT NULL REFERENCES app_auth.roles(id) ON DELETE CASCADE,
  preview_for_user_id BIGINT REFERENCES app_auth.users(id) ON DELETE SET NULL,
  visible_menu_keys JSONB DEFAULT '[]'::jsonb,
  effective_permissions JSONB DEFAULT '[]'::jsonb,
  generated_by BIGINT REFERENCES app_auth.users(id) ON DELETE SET NULL,
  generated_at TIMESTAMPTZ DEFAULT NOW()
);

DELETE FROM ems.dynamic_role_templates
WHERE company_id IS NULL
  AND template_key IN ('ACADEMIC_MANAGER', 'FINANCE_MANAGER', 'PLACEMENT_OFFICER', 'TIMETABLE_COORDINATOR');

INSERT INTO ems.dynamic_role_templates (
  company_id,
  template_key,
  display_name,
  description,
  default_menu_keys,
  default_permission_names,
  is_platform_template,
  is_active
) VALUES
  (NULL, 'ACADEMIC_MANAGER', 'Academic Manager', 'Full academic operations without tenant-owner delete.', '["ems.students","ems.tutors","ems.courses","ems.batches","ems.assignments","ems.quizzes","ems.live_classes","ems.attendance","ems.approvals","ems.reports"]'::jsonb, '["ems.students.view","ems.courses.approve","ems.assignments.approve","ems.quizzes.approve","ems.live_classes.approve"]'::jsonb, TRUE, TRUE),
  (NULL, 'FINANCE_MANAGER', 'Finance Manager', 'Tenant billing, invoices, payments and financial reports.', '["ems.dashboard","ems.reports"]'::jsonb, '["ems.dashboard.view","ems.reports.view","ems.reports.export"]'::jsonb, TRUE, TRUE),
  (NULL, 'PLACEMENT_OFFICER', 'Placement Officer', 'Read-only performance and certificate tracking.', '["ems.students","ems.certificates","ems.reports"]'::jsonb, '["ems.students.view","ems.certificates.view","ems.reports.view"]'::jsonb, TRUE, TRUE),
  (NULL, 'TIMETABLE_COORDINATOR', 'Timetable Coordinator', 'Batch calendar and live class scheduling.', '["ems.batches","ems.live_classes","ems.attendance"]'::jsonb, '["ems.batches.view","ems.live_classes.create","ems.live_classes.edit","ems.attendance.view"]'::jsonb, TRUE, TRUE)
ON CONFLICT DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_ems_dynamic_templates_company ON ems.dynamic_role_templates(company_id, is_active);
CREATE INDEX IF NOT EXISTS idx_ems_role_scope_company_role ON ems.role_menu_scope_rules(company_id, role_id);
CREATE INDEX IF NOT EXISTS idx_ems_access_preview_company_role ON ems.access_preview_snapshots(company_id, role_id, generated_at DESC);

DROP TRIGGER IF EXISTS update_ems_dynamic_role_templates_updated_at ON ems.dynamic_role_templates;
CREATE TRIGGER update_ems_dynamic_role_templates_updated_at BEFORE UPDATE ON ems.dynamic_role_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_ems_role_menu_scope_rules_updated_at ON ems.role_menu_scope_rules;
CREATE TRIGGER update_ems_role_menu_scope_rules_updated_at BEFORE UPDATE ON ems.role_menu_scope_rules FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMIT;
