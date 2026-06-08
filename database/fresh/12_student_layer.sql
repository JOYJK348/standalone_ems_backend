-- ============================================================================
-- LAYER 5: STUDENT PORTAL
-- Own learning scope: course progress, lesson completion, notifications,
-- practice lab access and student profile state.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS ems.student_lesson_progress (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
  student_id BIGINT NOT NULL REFERENCES ems.students(id) ON DELETE CASCADE,
  course_id BIGINT NOT NULL REFERENCES ems.courses(id) ON DELETE CASCADE,
  module_id BIGINT REFERENCES ems.course_modules(id) ON DELETE CASCADE,
  lesson_id BIGINT NOT NULL REFERENCES ems.lessons(id) ON DELETE CASCADE,
  progress_status VARCHAR(30) DEFAULT 'NOT_STARTED',
  progress_percent NUMERIC(5,2) DEFAULT 0,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  last_accessed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, student_id, lesson_id),
  CONSTRAINT chk_ems_lesson_progress_status CHECK (progress_status IN ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED'))
);

CREATE TABLE IF NOT EXISTS ems.student_material_access (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
  student_id BIGINT NOT NULL REFERENCES ems.students(id) ON DELETE CASCADE,
  material_id BIGINT NOT NULL REFERENCES ems.course_materials(id) ON DELETE CASCADE,
  first_viewed_at TIMESTAMPTZ DEFAULT NOW(),
  last_viewed_at TIMESTAMPTZ DEFAULT NOW(),
  download_count INTEGER DEFAULT 0,
  UNIQUE(company_id, student_id, material_id)
);

CREATE TABLE IF NOT EXISTS ems.notifications (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
  recipient_user_id BIGINT NOT NULL REFERENCES app_auth.users(id) ON DELETE CASCADE,
  notification_type VARCHAR(80) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT,
  link_url VARCHAR(500),
  related_entity_type VARCHAR(100),
  related_entity_id BIGINT,
  is_read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS ems.practice_lab_licenses (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
  student_id BIGINT NOT NULL REFERENCES ems.students(id) ON DELETE CASCADE,
  lab_key VARCHAR(80) NOT NULL,
  license_status VARCHAR(30) DEFAULT 'ACTIVE',
  assigned_by BIGINT REFERENCES app_auth.users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  UNIQUE(company_id, student_id, lab_key),
  CONSTRAINT chk_ems_practice_license_status CHECK (license_status IN ('ACTIVE', 'EXPIRED', 'REVOKED'))
);

CREATE TABLE IF NOT EXISTS ems.practice_lab_attempts (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
  student_id BIGINT NOT NULL REFERENCES ems.students(id) ON DELETE CASCADE,
  lab_key VARCHAR(80) NOT NULL,
  scenario_key VARCHAR(120) NOT NULL,
  attempt_status VARCHAR(30) DEFAULT 'IN_PROGRESS',
  score NUMERIC(8,2),
  max_score NUMERIC(8,2),
  answers JSONB DEFAULT '{}'::jsonb,
  validation_result JSONB DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  submitted_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT chk_ems_practice_attempt_status CHECK (attempt_status IN ('IN_PROGRESS', 'SUBMITTED', 'PASSED', 'FAILED', 'REVIEW_REQUIRED'))
);

CREATE INDEX IF NOT EXISTS idx_ems_student_progress_student ON ems.student_lesson_progress(company_id, student_id, progress_status);

ALTER TABLE ems.notifications
  ADD COLUMN IF NOT EXISTS recipient_user_id BIGINT REFERENCES app_auth.users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_ems_notifications_recipient ON ems.notifications(company_id, recipient_user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ems_practice_licenses_student ON ems.practice_lab_licenses(company_id, student_id, license_status);
CREATE INDEX IF NOT EXISTS idx_ems_practice_attempts_student ON ems.practice_lab_attempts(company_id, student_id, lab_key);

DROP TRIGGER IF EXISTS update_ems_student_lesson_progress_updated_at ON ems.student_lesson_progress;
CREATE TRIGGER update_ems_student_lesson_progress_updated_at BEFORE UPDATE ON ems.student_lesson_progress FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_ems_practice_lab_attempts_updated_at ON ems.practice_lab_attempts;
CREATE TRIGGER update_ems_practice_lab_attempts_updated_at BEFORE UPDATE ON ems.practice_lab_attempts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMIT;
