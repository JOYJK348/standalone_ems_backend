-- ============================================================================
-- LAYER 4: TUTOR PORTAL
-- Assigned teaching scope, content creation, grading, live classes,
-- attendance operations, doubts and notifications.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS ems.tutor_course_assignments (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
  tutor_employee_id BIGINT NOT NULL REFERENCES core.employees(id) ON DELETE CASCADE,
  course_id BIGINT NOT NULL REFERENCES ems.courses(id) ON DELETE CASCADE,
  batch_id BIGINT REFERENCES ems.batches(id) ON DELETE CASCADE,
  assignment_type VARCHAR(40) DEFAULT 'PRIMARY',
  assigned_by BIGINT REFERENCES app_auth.users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, tutor_employee_id, course_id, batch_id),
  CONSTRAINT chk_ems_tutor_assignment_type CHECK (assignment_type IN ('PRIMARY', 'ASSISTANT', 'GUEST'))
);

CREATE TABLE IF NOT EXISTS ems.grading_queue (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
  tutor_employee_id BIGINT REFERENCES core.employees(id) ON DELETE SET NULL,
  submission_id BIGINT REFERENCES ems.assignment_submissions(id) ON DELETE CASCADE,
  quiz_attempt_id BIGINT REFERENCES ems.quiz_attempts(id) ON DELETE CASCADE,
  queue_status VARCHAR(30) DEFAULT 'PENDING',
  priority VARCHAR(20) DEFAULT 'NORMAL',
  due_at TIMESTAMPTZ,
  graded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT chk_ems_grading_queue_target CHECK (submission_id IS NOT NULL OR quiz_attempt_id IS NOT NULL),
  CONSTRAINT chk_ems_grading_queue_status CHECK (queue_status IN ('PENDING', 'IN_REVIEW', 'GRADED', 'RETURNED'))
);

CREATE TABLE IF NOT EXISTS ems.doubt_threads (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
  student_id BIGINT NOT NULL REFERENCES ems.students(id) ON DELETE CASCADE,
  tutor_employee_id BIGINT REFERENCES core.employees(id) ON DELETE SET NULL,
  course_id BIGINT REFERENCES ems.courses(id) ON DELETE SET NULL,
  batch_id BIGINT REFERENCES ems.batches(id) ON DELETE SET NULL,
  title VARCHAR(255) NOT NULL,
  status VARCHAR(30) DEFAULT 'OPEN',
  priority VARCHAR(20) DEFAULT 'NORMAL',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  CONSTRAINT chk_ems_doubt_status CHECK (status IN ('OPEN', 'ASSIGNED', 'ANSWERED', 'RESOLVED', 'CLOSED'))
);

CREATE TABLE IF NOT EXISTS ems.doubt_messages (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
  thread_id BIGINT NOT NULL REFERENCES ems.doubt_threads(id) ON DELETE CASCADE,
  sender_user_id BIGINT NOT NULL REFERENCES app_auth.users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  attachments JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ems_tutor_assignments_tutor ON ems.tutor_course_assignments(company_id, tutor_employee_id, is_active);
CREATE INDEX IF NOT EXISTS idx_ems_grading_queue_tutor_status ON ems.grading_queue(company_id, tutor_employee_id, queue_status);
CREATE INDEX IF NOT EXISTS idx_ems_doubt_threads_tutor_status ON ems.doubt_threads(company_id, tutor_employee_id, status);

DROP TRIGGER IF EXISTS update_ems_tutor_course_assignments_updated_at ON ems.tutor_course_assignments;
CREATE TRIGGER update_ems_tutor_course_assignments_updated_at BEFORE UPDATE ON ems.tutor_course_assignments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_ems_grading_queue_updated_at ON ems.grading_queue;
CREATE TRIGGER update_ems_grading_queue_updated_at BEFORE UPDATE ON ems.grading_queue FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_ems_doubt_threads_updated_at ON ems.doubt_threads;
CREATE TRIGGER update_ems_doubt_threads_updated_at BEFORE UPDATE ON ems.doubt_threads FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMIT;
