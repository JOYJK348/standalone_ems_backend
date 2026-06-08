-- ============================================================================
-- SEED: Complete Academic Portal Data
-- Creates manager@durkkas.com, tutors, students, courses, batches, 
-- assignments, quizzes, materials, live classes, attendance & enrollments
-- Password for all accounts: Durk@123
-- ============================================================================

-- Step 0: Fix schema permissions for REST API access
GRANT USAGE ON SCHEMA app_auth TO service_role, anon, authenticated;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA app_auth TO service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA app_auth TO service_role;

GRANT USAGE ON SCHEMA ems TO service_role, anon, authenticated;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA ems TO service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA ems TO service_role;

GRANT USAGE ON SCHEMA core TO service_role, anon, authenticated;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA core TO service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA core TO service_role;

-- Ensure employees table has user_id column (for linking to app_auth.users)
ALTER TABLE core.employees ADD COLUMN IF NOT EXISTS user_id BIGINT;

-- Create course_tutors table (used by tutor dashboard & course filtering)
CREATE TABLE IF NOT EXISTS ems.course_tutors (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
    course_id BIGINT NOT NULL REFERENCES ems.courses(id) ON DELETE CASCADE,
    tutor_id BIGINT NOT NULL REFERENCES core.employees(id) ON DELETE CASCADE,
    tutor_role VARCHAR(50) DEFAULT 'PRIMARY',
    is_primary BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    UNIQUE(company_id, course_id, tutor_id)
);

-- Performance indexes for 500+ concurrent users
CREATE INDEX IF NOT EXISTS idx_courses_active ON ems.courses(company_id, status, is_active) WHERE deleted_at IS NULL AND is_active = true;
CREATE INDEX IF NOT EXISTS idx_courses_created ON ems.courses(company_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_enrollments_student ON ems.student_enrollments(student_id, enrollment_status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_enrollments_course ON ems.student_enrollments(course_id, enrollment_status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_course_tutors_lookup ON ems.course_tutors(tutor_id, course_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_attendance_session ON ems.attendance_sessions(company_id, batch_id, session_date) WHERE status = 'OPEN';
CREATE INDEX IF NOT EXISTS idx_attendance_records_session ON ems.attendance_records(session_id, student_id);
CREATE INDEX IF NOT EXISTS idx_assignments_tutor ON ems.assignments(tutor_id, is_active, deadline) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_assignments_course ON ems.assignments(course_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_quizzes_course ON ems.quizzes(course_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_materials_course ON ems.course_materials(course_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_live_classes_schedule ON ems.live_classes(course_id, scheduled_date, class_status);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_student ON ems.quiz_attempts(quiz_id, student_id, attempt_number);
CREATE INDEX IF NOT EXISTS idx_employees_user ON core.employees(company_id, user_id) WHERE user_id IS NOT NULL;

-- Add unique constraints for idempotent re-runs
ALTER TABLE ems.quiz_attempts DROP CONSTRAINT IF EXISTS uq_quiz_attempts;
ALTER TABLE ems.quiz_attempts ADD CONSTRAINT uq_quiz_attempts UNIQUE (quiz_id, student_id, attempt_number);

-- Ensure batch unique constraint exists for ON CONFLICT (drop old auto-named if present)
ALTER TABLE ems.batches DROP CONSTRAINT IF EXISTS batches_company_id_batch_code_key;
ALTER TABLE ems.batches DROP CONSTRAINT IF EXISTS uq_batches_company_batch;
ALTER TABLE ems.batches ADD CONSTRAINT uq_batches_company_batch UNIQUE (company_id, batch_code);

-- Ensure course unique constraint exists for ON CONFLICT (drop old auto-named if present)
ALTER TABLE ems.courses DROP CONSTRAINT IF EXISTS courses_company_id_course_code_key;
ALTER TABLE ems.courses DROP CONSTRAINT IF EXISTS uq_courses_company_code;
ALTER TABLE ems.courses ADD CONSTRAINT uq_courses_company_code UNIQUE (company_id, course_code);

-- Ensure enrollment unique constraint exists for ON CONFLICT
ALTER TABLE ems.student_enrollments DROP CONSTRAINT IF EXISTS student_enrollments_company_id_student_id_course_id_bat_key;
ALTER TABLE ems.student_enrollments DROP CONSTRAINT IF EXISTS uq_student_enrollments;
ALTER TABLE ems.student_enrollments ADD CONSTRAINT uq_student_enrollments UNIQUE (company_id, student_id, course_id, batch_id);

-- Step 1: Create users & role assignments
DO $$
DECLARE
    v_company_id BIGINT;
    v_branch_id BIGINT;
    v_manager_id BIGINT;
    v_role_id BIGINT;
    v_tutor_role_id BIGINT;
    v_student_role_id BIGINT;
    v_emp_id BIGINT;
    v_tutor_emp_ids BIGINT[];
    v_course_ids BIGINT[];
    v_batch_ids BIGINT[];
    v_student_ids BIGINT[];
    v_quiz_id BIGINT;
    v_quiz_ids BIGINT[];
    v_assign_ids BIGINT[];
    v_i INTEGER;
    v_student_id BIGINT;
    v_batch_idx INTEGER;
    v_email TEXT;
    v_first_name TEXT;
    v_last_name TEXT;
    v_student_user_id BIGINT;
    v_tutor_user_id BIGINT;
    v_attempt_id BIGINT;
    v_enroll_id BIGINT;
    v_student_emails TEXT[];
BEGIN
    -- Get DIPL company & branch  
    SELECT id INTO v_company_id FROM core.companies WHERE code = 'DIPL';
    SELECT id INTO v_branch_id FROM core.branches WHERE company_id = v_company_id AND code = 'DIPL-MAIN';
    
    RAISE NOTICE 'Using Company ID: %, Branch ID: %', v_company_id, v_branch_id;

    -- Get role IDs
    SELECT id INTO v_role_id FROM app_auth.roles WHERE name = 'ACADEMIC_COORDINATOR';
    SELECT id INTO v_tutor_role_id FROM app_auth.roles WHERE name = 'TUTOR';
    SELECT id INTO v_student_role_id FROM app_auth.roles WHERE name = 'STUDENT';

    -- ========================================================================
    -- CREATE ACADEMIC MANAGER (manager@durkkas.com)
    -- ========================================================================
    INSERT INTO app_auth.users (email, password_hash, first_name, last_name, display_name, is_active, is_verified)
    VALUES (
        'manager@durkkas.com',
        '$2a$10$kzgTk1M2qRd518SAE2oWTeE3Ru7a7.OvwxWSCYl3fnwtPYFvkdIsu',
        'Academic', 'Manager', 'Academic Manager', TRUE, TRUE
    )
    ON CONFLICT (email) DO UPDATE SET
        password_hash = EXCLUDED.password_hash,
        first_name = EXCLUDED.first_name,
        last_name = EXCLUDED.last_name,
        display_name = EXCLUDED.display_name,
        is_active = TRUE,
        is_verified = TRUE
    RETURNING id INTO v_manager_id;

    -- Assign ACADEMIC_COORDINATOR role (maps to /ems/academic-manager/dashboard)
    DELETE FROM app_auth.user_roles WHERE user_id = v_manager_id AND role_id = v_role_id;
    INSERT INTO app_auth.user_roles (user_id, role_id, company_id, branch_id, is_active)
    VALUES (v_manager_id, v_role_id, v_company_id, v_branch_id, TRUE);

    -- Create employee record for manager
    INSERT INTO core.employees (company_id, branch_id, user_id, employee_code, first_name, last_name, email, is_active)
    VALUES (v_company_id, v_branch_id, v_manager_id, 'MGR-001', 'Academic', 'Manager', 'manager@durkkas.com', TRUE)
    ON CONFLICT (company_id, employee_code) DO UPDATE SET user_id = EXCLUDED.user_id, is_active = TRUE;

    -- ========================================================================
    -- CREATE 5 TUTORS
    -- ========================================================================
    -- Tutor 1: Rajesh Kumar (Full Stack Development)
    INSERT INTO app_auth.users (email, password_hash, first_name, last_name, display_name, is_active, is_verified)
    VALUES ('rajesh.kumar@durkkas.com', '$2a$10$kzgTk1M2qRd518SAE2oWTeE3Ru7a7.OvwxWSCYl3fnwtPYFvkdIsu',
            'Rajesh', 'Kumar', 'Prof. Rajesh Kumar', TRUE, TRUE)
    ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id INTO v_tutor_user_id;
    DELETE FROM app_auth.user_roles WHERE user_id = v_tutor_user_id AND role_id = v_tutor_role_id;
    INSERT INTO app_auth.user_roles (user_id, role_id, company_id, branch_id, is_active)
    VALUES (v_tutor_user_id, v_tutor_role_id, v_company_id, v_branch_id, TRUE);
    INSERT INTO core.employees (company_id, branch_id, user_id, employee_code, first_name, last_name, email, is_active)
    VALUES (v_company_id, v_branch_id, v_tutor_user_id, 'TUT-001', 'Rajesh', 'Kumar', 'rajesh.kumar@durkkas.com', TRUE)
    ON CONFLICT (company_id, employee_code) DO UPDATE SET user_id = EXCLUDED.user_id;

    -- Tutor 2: Priya Sharma (Data Science & AI)
    INSERT INTO app_auth.users (email, password_hash, first_name, last_name, display_name, is_active, is_verified)
    VALUES ('priya.sharma@durkkas.com', '$2a$10$kzgTk1M2qRd518SAE2oWTeE3Ru7a7.OvwxWSCYl3fnwtPYFvkdIsu',
            'Priya', 'Sharma', 'Dr. Priya Sharma', TRUE, TRUE)
    ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id INTO v_tutor_user_id;
    DELETE FROM app_auth.user_roles WHERE user_id = v_tutor_user_id AND role_id = v_tutor_role_id;
    INSERT INTO app_auth.user_roles (user_id, role_id, company_id, branch_id, is_active)
    VALUES (v_tutor_user_id, v_tutor_role_id, v_company_id, v_branch_id, TRUE);
    INSERT INTO core.employees (company_id, branch_id, user_id, employee_code, first_name, last_name, email, is_active)
    VALUES (v_company_id, v_branch_id, v_tutor_user_id, 'TUT-002', 'Priya', 'Sharma', 'priya.sharma@durkkas.com', TRUE)
    ON CONFLICT (company_id, employee_code) DO UPDATE SET user_id = EXCLUDED.user_id;

    -- Tutor 3: Amit Patel (UI/UX Design)
    INSERT INTO app_auth.users (email, password_hash, first_name, last_name, display_name, is_active, is_verified)
    VALUES ('amit.patel@durkkas.com', '$2a$10$kzgTk1M2qRd518SAE2oWTeE3Ru7a7.OvwxWSCYl3fnwtPYFvkdIsu',
            'Amit', 'Patel', 'Prof. Amit Patel', TRUE, TRUE)
    ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id INTO v_tutor_user_id;
    DELETE FROM app_auth.user_roles WHERE user_id = v_tutor_user_id AND role_id = v_tutor_role_id;
    INSERT INTO app_auth.user_roles (user_id, role_id, company_id, branch_id, is_active)
    VALUES (v_tutor_user_id, v_tutor_role_id, v_company_id, v_branch_id, TRUE);
    INSERT INTO core.employees (company_id, branch_id, user_id, employee_code, first_name, last_name, email, is_active)
    VALUES (v_company_id, v_branch_id, v_tutor_user_id, 'TUT-003', 'Amit', 'Patel', 'amit.patel@durkkas.com', TRUE)
    ON CONFLICT (company_id, employee_code) DO UPDATE SET user_id = EXCLUDED.user_id;

    -- Tutor 4: Sneha Reddy (Mobile Development)
    INSERT INTO app_auth.users (email, password_hash, first_name, last_name, display_name, is_active, is_verified)
    VALUES ('sneha.reddy@durkkas.com', '$2a$10$kzgTk1M2qRd518SAE2oWTeE3Ru7a7.OvwxWSCYl3fnwtPYFvkdIsu',
            'Sneha', 'Reddy', 'Dr. Sneha Reddy', TRUE, TRUE)
    ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id INTO v_tutor_user_id;
    DELETE FROM app_auth.user_roles WHERE user_id = v_tutor_user_id AND role_id = v_tutor_role_id;
    INSERT INTO app_auth.user_roles (user_id, role_id, company_id, branch_id, is_active)
    VALUES (v_tutor_user_id, v_tutor_role_id, v_company_id, v_branch_id, TRUE);
    INSERT INTO core.employees (company_id, branch_id, user_id, employee_code, first_name, last_name, email, is_active)
    VALUES (v_company_id, v_branch_id, v_tutor_user_id, 'TUT-004', 'Sneha', 'Reddy', 'sneha.reddy@durkkas.com', TRUE)
    ON CONFLICT (company_id, employee_code) DO UPDATE SET user_id = EXCLUDED.user_id;

    -- Tutor 5: Vikram Singh (Cloud & DevOps)
    INSERT INTO app_auth.users (email, password_hash, first_name, last_name, display_name, is_active, is_verified)
    VALUES ('vikram.singh@durkkas.com', '$2a$10$kzgTk1M2qRd518SAE2oWTeE3Ru7a7.OvwxWSCYl3fnwtPYFvkdIsu',
            'Vikram', 'Singh', 'Prof. Vikram Singh', TRUE, TRUE)
    ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id INTO v_tutor_user_id;
    DELETE FROM app_auth.user_roles WHERE user_id = v_tutor_user_id AND role_id = v_tutor_role_id;
    INSERT INTO app_auth.user_roles (user_id, role_id, company_id, branch_id, is_active)
    VALUES (v_tutor_user_id, v_tutor_role_id, v_company_id, v_branch_id, TRUE);
    INSERT INTO core.employees (company_id, branch_id, user_id, employee_code, first_name, last_name, email, is_active)
    VALUES (v_company_id, v_branch_id, v_tutor_user_id, 'TUT-005', 'Vikram', 'Singh', 'vikram.singh@durkkas.com', TRUE)
    ON CONFLICT (company_id, employee_code) DO UPDATE SET user_id = EXCLUDED.user_id;

    -- ========================================================================
    -- 3. COURSES
    -- ========================================================================
    INSERT INTO ems.courses (company_id, branch_id, course_code, course_name, course_description, duration_hours, is_published, status, course_category, course_level, total_lessons)
    VALUES
        (v_company_id, v_branch_id, 'FS-2026', 'Full Stack Web Development',
         'Master modern web development with React, Node.js, and PostgreSQL. Build real-world projects and deploy to production.', 640, TRUE, 'PUBLISHED', 'Programming', 'ADVANCED', 64),
        (v_company_id, v_branch_id, 'DS-2026', 'Data Science & AI Mastery',
         'Learn Python, Pandas, Scikit-learn, TensorFlow and build ML models on real datasets.', 800, TRUE, 'PUBLISHED', 'Data Science', 'ADVANCED', 80),
         (v_company_id, v_branch_id, 'UX-2026', 'Professional UI/UX Design',
          'Learn user research, wireframing, prototyping, and design systems using Figma.', 400, TRUE, 'PUBLISHED', 'Design', 'INTERMEDIATE', 40)
    ON CONFLICT (company_id, course_code) DO NOTHING;

    -- Store course IDs
    SELECT ARRAY_AGG(id) INTO v_course_ids FROM ems.courses 
    WHERE company_id = v_company_id AND course_code IN ('FS-2026', 'DS-2026', 'UX-2026');

    -- ========================================================================
    -- 4. BATCHES
    -- ========================================================================
    INSERT INTO ems.batches (company_id, branch_id, batch_code, batch_name, course_id, start_date, end_date, max_students, current_strength, status)
    SELECT v_company_id, v_branch_id, 'FSD-BATCH-A', 'Full Stack Morning Batch', c.id, '2026-06-10'::DATE, '2026-10-10'::DATE, 30, 0, 'ACTIVE'
    FROM ems.courses c WHERE c.course_code = 'FS-2026' AND c.company_id = v_company_id
    ON CONFLICT (company_id, batch_code) DO NOTHING;

    INSERT INTO ems.batches (company_id, branch_id, batch_code, batch_name, course_id, start_date, end_date, max_students, current_strength, status)
    SELECT v_company_id, v_branch_id, 'DSAI-BATCH-B', 'Data Science Weekend Batch', c.id, '2026-06-12'::DATE, '2026-11-12'::DATE, 25, 0, 'ACTIVE'
    FROM ems.courses c WHERE c.course_code = 'DS-2026' AND c.company_id = v_company_id
    ON CONFLICT (company_id, batch_code) DO NOTHING;

    INSERT INTO ems.batches (company_id, branch_id, batch_code, batch_name, course_id, start_date, end_date, max_students, current_strength, status)
    SELECT v_company_id, v_branch_id, 'UIUX-BATCH-C', 'UI/UX Design Evening Batch', c.id, '2026-06-15'::DATE, '2026-09-15'::DATE, 20, 0, 'ACTIVE'
    FROM ems.courses c WHERE c.course_code = 'UX-2026' AND c.company_id = v_company_id
    ON CONFLICT (company_id, batch_code) DO NOTHING;

    -- Store batch IDs
    SELECT ARRAY_AGG(id ORDER BY id) INTO v_batch_ids FROM ems.batches 
    WHERE company_id = v_company_id AND batch_code IN ('FSD-BATCH-A', 'DSAI-BATCH-B', 'UIUX-BATCH-C');

    -- ========================================================================
    -- 5. TUTOR -> COURSE ASSIGNMENTS
    -- ========================================================================
    -- Rajesh -> Full Stack
    INSERT INTO ems.tutor_course_assignments (company_id, tutor_employee_id, course_id, batch_id, assignment_type, is_active)
    SELECT v_company_id, e.id, c.id, b.id, 'PRIMARY', TRUE
    FROM core.employees e, ems.courses c, ems.batches b
    WHERE e.employee_code = 'TUT-001' AND e.company_id = v_company_id
      AND c.course_code = 'FS-2026' AND c.company_id = v_company_id
      AND b.batch_code = 'FSD-BATCH-A' AND b.company_id = v_company_id
    ON CONFLICT (company_id, tutor_employee_id, course_id, batch_id) DO NOTHING;

    -- Priya -> Data Science
    INSERT INTO ems.tutor_course_assignments (company_id, tutor_employee_id, course_id, batch_id, assignment_type, is_active)
    SELECT v_company_id, e.id, c.id, b.id, 'PRIMARY', TRUE
    FROM core.employees e, ems.courses c, ems.batches b
    WHERE e.employee_code = 'TUT-002' AND e.company_id = v_company_id
      AND c.course_code = 'DS-2026' AND c.company_id = v_company_id
      AND b.batch_code = 'DSAI-BATCH-B' AND b.company_id = v_company_id
    ON CONFLICT (company_id, tutor_employee_id, course_id, batch_id) DO NOTHING;

    -- Amit -> UI/UX
    INSERT INTO ems.tutor_course_assignments (company_id, tutor_employee_id, course_id, batch_id, assignment_type, is_active)
    SELECT v_company_id, e.id, c.id, b.id, 'PRIMARY', TRUE
    FROM core.employees e, ems.courses c, ems.batches b
    WHERE e.employee_code = 'TUT-003' AND e.company_id = v_company_id
      AND c.course_code = 'UX-2026' AND c.company_id = v_company_id
      AND b.batch_code = 'UIUX-BATCH-C' AND b.company_id = v_company_id
    ON CONFLICT (company_id, tutor_employee_id, course_id, batch_id) DO NOTHING;

    -- Sneha -> Full Stack (Assistant)
    INSERT INTO ems.tutor_course_assignments (company_id, tutor_employee_id, course_id, batch_id, assignment_type, is_active)
    SELECT v_company_id, e.id, c.id, b.id, 'ASSISTANT', TRUE
    FROM core.employees e, ems.courses c, ems.batches b
    WHERE e.employee_code = 'TUT-004' AND e.company_id = v_company_id
      AND c.course_code = 'FS-2026' AND c.company_id = v_company_id
      AND b.batch_code = 'FSD-BATCH-A' AND b.company_id = v_company_id
    ON CONFLICT (company_id, tutor_employee_id, course_id, batch_id) DO NOTHING;

    -- Populate course_tutors table (for tutor dashboard & course filtering)
    INSERT INTO ems.course_tutors (company_id, course_id, tutor_id, tutor_role, is_primary, is_active)
    SELECT tca.company_id, tca.course_id, tca.tutor_employee_id,
           CASE WHEN tca.assignment_type = 'PRIMARY' THEN 'PRIMARY' ELSE 'ASSISTANT' END,
           CASE WHEN tca.assignment_type = 'PRIMARY' THEN TRUE ELSE FALSE END,
           TRUE
    FROM ems.tutor_course_assignments tca
    WHERE tca.company_id = v_company_id
    ON CONFLICT (company_id, course_id, tutor_id) DO NOTHING;

    -- Also set tutor_id on courses for legacy compatibility
    UPDATE ems.courses c SET tutor_id = (
        SELECT tca.tutor_employee_id FROM ems.tutor_course_assignments tca
        WHERE tca.course_id = c.id AND tca.company_id = c.company_id
        AND tca.assignment_type = 'PRIMARY' LIMIT 1
    ) WHERE c.company_id = v_company_id AND c.tutor_id IS NULL;

    -- ========================================================================
    -- 6. ASSIGNMENTS
    -- ========================================================================
    INSERT INTO ems.assignments (company_id, course_id, batch_id, assignment_title, assignment_description, max_marks, passing_marks, deadline, submission_mode, is_active)
    SELECT v_company_id, c.id, b.id, 'React Component Library', 'Build a reusable component library using React with Storybook documentation.', 100, 40, '2026-07-15 23:59:59'::TIMESTAMPTZ, 'ONLINE', TRUE
    FROM ems.courses c, ems.batches b WHERE c.course_code = 'FS-2026' AND b.batch_code = 'FSD-BATCH-A';

    INSERT INTO ems.assignments (company_id, course_id, batch_id, assignment_title, assignment_description, max_marks, passing_marks, deadline, submission_mode, is_active)
    SELECT v_company_id, c.id, b.id, 'REST API Development', 'Build a complete REST API with Node.js, Express and PostgreSQL for a library management system.', 100, 40, '2026-07-30 23:59:59'::TIMESTAMPTZ, 'ONLINE', TRUE
    FROM ems.courses c, ems.batches b WHERE c.course_code = 'FS-2026' AND b.batch_code = 'FSD-BATCH-A';

    INSERT INTO ems.assignments (company_id, course_id, batch_id, assignment_title, assignment_description, max_marks, passing_marks, deadline, submission_mode, is_active)
    SELECT v_company_id, c.id, b.id, 'Data Cleaning & EDA', 'Clean a messy dataset and perform exploratory data analysis with visualizations.', 100, 40, '2026-07-20 23:59:59'::TIMESTAMPTZ, 'ONLINE', TRUE
    FROM ems.courses c, ems.batches b WHERE c.course_code = 'DS-2026' AND b.batch_code = 'DSAI-BATCH-B';

    INSERT INTO ems.assignments (company_id, course_id, batch_id, assignment_title, assignment_description, max_marks, passing_marks, deadline, submission_mode, is_active)
    SELECT v_company_id, c.id, b.id, 'ML Model Deployment', 'Train a classification model and deploy it as a web service using Flask.', 100, 40, '2026-08-05 23:59:59'::TIMESTAMPTZ, 'ONLINE', TRUE
    FROM ems.courses c, ems.batches b WHERE c.course_code = 'DS-2026' AND b.batch_code = 'DSAI-BATCH-B';

    INSERT INTO ems.assignments (company_id, course_id, batch_id, assignment_title, assignment_description, max_marks, passing_marks, deadline, submission_mode, is_active)
    SELECT v_company_id, c.id, b.id, 'Figma Design System', 'Create a complete design system in Figma with components, variants, and auto layout.', 100, 40, '2026-07-25 23:59:59'::TIMESTAMPTZ, 'ONLINE', TRUE
    FROM ems.courses c, ems.batches b WHERE c.course_code = 'UX-2026' AND b.batch_code = 'UIUX-BATCH-C';

    INSERT INTO ems.assignments (company_id, course_id, batch_id, assignment_title, assignment_description, max_marks, passing_marks, deadline, submission_mode, is_active)
    SELECT v_company_id, c.id, b.id, 'User Research Report', 'Conduct user research for a food delivery app and present findings with personas.', 100, 40, '2026-08-10 23:59:59'::TIMESTAMPTZ, 'ONLINE', TRUE
    FROM ems.courses c, ems.batches b WHERE c.course_code = 'UX-2026' AND b.batch_code = 'UIUX-BATCH-C';

    -- ========================================================================
    -- 7. QUIZZES
    -- ========================================================================
    INSERT INTO ems.quizzes (company_id, course_id, quiz_title, quiz_description, total_marks, passing_marks, duration_minutes, max_attempts, is_active)
    SELECT v_company_id, c.id, 'React Fundamentals Assessment', 'Test your knowledge of React components, hooks, state management, and routing.', 100, 50, 60, 2, TRUE
    FROM ems.courses c WHERE c.course_code = 'FS-2026';

    INSERT INTO ems.quizzes (company_id, course_id, quiz_title, quiz_description, total_marks, passing_marks, duration_minutes, max_attempts, is_active)
    SELECT v_company_id, c.id, 'Node.js & Express Quiz', 'Assessment on Node.js runtime, Express framework, middleware and database integration.', 100, 50, 45, 2, TRUE
    FROM ems.courses c WHERE c.course_code = 'FS-2026';

    INSERT INTO ems.quizzes (company_id, course_id, quiz_title, quiz_description, total_marks, passing_marks, duration_minutes, max_attempts, is_active)
    SELECT v_company_id, c.id, 'Python & ML Basics', 'Fundamentals of Python for data science, pandas, numpy and basic ML concepts.', 100, 50, 60, 2, TRUE
    FROM ems.courses c WHERE c.course_code = 'DS-2026';

    INSERT INTO ems.quizzes (company_id, course_id, quiz_title, quiz_description, total_marks, passing_marks, duration_minutes, max_attempts, is_active)
    SELECT v_company_id, c.id, 'Deep Learning Fundamentals', 'Quiz on neural networks, CNNs, RNNs, and TensorFlow basics.', 100, 50, 60, 2, TRUE
    FROM ems.courses c WHERE c.course_code = 'DS-2026';

    INSERT INTO ems.quizzes (company_id, course_id, quiz_title, quiz_description, total_marks, passing_marks, duration_minutes, max_attempts, is_active)
    SELECT v_company_id, c.id, 'Design Principles Quiz', 'Test your knowledge of UX laws, color theory, typography, and layout principles.', 100, 50, 45, 2, TRUE
    FROM ems.courses c WHERE c.course_code = 'UX-2026';

    INSERT INTO ems.quizzes (company_id, course_id, quiz_title, quiz_description, total_marks, passing_marks, duration_minutes, max_attempts, is_active)
    SELECT v_company_id, c.id, 'Figma & Prototyping Quiz', 'Assessment on Figma tools, auto layout, components, and interactive prototyping.', 100, 50, 45, 2, TRUE
    FROM ems.courses c WHERE c.course_code = 'UX-2026';

    -- ========================================================================
    -- 8. QUIZ QUESTIONS & OPTIONS (for React Fundamentals)
    -- ========================================================================
    WITH quiz AS (
        SELECT id FROM ems.quizzes WHERE quiz_title = 'React Fundamentals Assessment' AND company_id = v_company_id
    )
    INSERT INTO ems.quiz_questions (company_id, quiz_id, question_text, question_type, question_order, marks)
    SELECT v_company_id, quiz.id, q.text, 'MULTIPLE_CHOICE', q.ord, q.marks
    FROM quiz, (VALUES
        (1, 'What hook is used for side effects in React?', 10),
        (2, 'Which method is used to create a React component?', 10),
        (3, 'What is the virtual DOM in React?', 10),
        (4, 'Which hook is used for state management in functional components?', 10),
        (5, 'What does JSX stand for?', 10)
    ) AS q(ord, text, marks);

    -- Options for each question
    WITH questions AS (
        SELECT qq.id, qq.question_text, qq.question_order
        FROM ems.quiz_questions qq
        JOIN ems.quizzes q ON q.id = qq.quiz_id
        WHERE q.quiz_title = 'React Fundamentals Assessment' AND q.company_id = v_company_id
    )
    INSERT INTO ems.quiz_options (question_id, option_text, is_correct, option_order)
    SELECT q.id, o.text, o.correct, o.ord
    FROM questions q, (VALUES
        (1, 'useEffect', TRUE, 1), (1, 'useState', FALSE, 2), (1, 'useContext', FALSE, 3), (1, 'useReducer', FALSE, 4),
        (2, 'createComponent()', FALSE, 1), (2, 'function or class', TRUE, 2), (2, 'renderComponent()', FALSE, 3), (2, 'new Component()', FALSE, 4),
        (3, 'A copy of the real DOM', FALSE, 1), (3, 'A lightweight representation of the DOM', TRUE, 2), (3, 'The actual browser DOM', FALSE, 3), (3, 'A database for components', FALSE, 4),
        (4, 'useEffect', FALSE, 1), (4, 'useHistory', FALSE, 2), (4, 'useState', TRUE, 3), (4, 'useRef', FALSE, 4),
        (5, 'JavaScript XML', TRUE, 1), (5, 'Java Syntax Extension', FALSE, 2), (5, 'JSON XML', FALSE, 3), (5, 'JavaScript XHR', FALSE, 4)
    ) AS o(q_ord, text, correct, ord)
    WHERE q.question_order = o.q_ord;

    -- ========================================================================
    -- 9. COURSE MATERIALS
    -- ========================================================================
    INSERT INTO ems.course_materials (company_id, course_id, material_name, material_type, file_url, is_downloadable)
    SELECT v_company_id, c.id, 'React Complete Guide PDF', 'PDF', 'https://storage.durkkas.com/materials/react-complete-guide.pdf', TRUE
    FROM ems.courses c WHERE c.course_code = 'FS-2026';

    INSERT INTO ems.course_materials (company_id, course_id, material_name, material_type, file_url, is_downloadable)
    SELECT v_company_id, c.id, 'Node.js Best Practices', 'PDF', 'https://storage.durkkas.com/materials/nodejs-best-practices.pdf', TRUE
    FROM ems.courses c WHERE c.course_code = 'FS-2026';

    INSERT INTO ems.course_materials (company_id, course_id, material_name, material_type, file_url, is_downloadable)
    SELECT v_company_id, c.id, 'Full Stack Project Starter', 'ZIP', 'https://storage.durkkas.com/materials/fullstack-starter.zip', TRUE
    FROM ems.courses c WHERE c.course_code = 'FS-2026';

    INSERT INTO ems.course_materials (company_id, course_id, material_name, material_type, file_url, is_downloadable)
    SELECT v_company_id, c.id, 'Python Data Science Handbook', 'PDF', 'https://storage.durkkas.com/materials/python-ds-handbook.pdf', TRUE
    FROM ems.courses c WHERE c.course_code = 'DS-2026';

    INSERT INTO ems.course_materials (company_id, course_id, material_name, material_type, file_url, is_downloadable)
    SELECT v_company_id, c.id, 'ML Algorithms Cheat Sheet', 'PDF', 'https://storage.durkkas.com/materials/ml-cheatsheet.pdf', TRUE
    FROM ems.courses c WHERE c.course_code = 'DS-2026';

    INSERT INTO ems.course_materials (company_id, course_id, material_name, material_type, file_url, is_downloadable)
    SELECT v_company_id, c.id, 'Sample Datasets Pack', 'ZIP', 'https://storage.durkkas.com/materials/datasets.zip', TRUE
    FROM ems.courses c WHERE c.course_code = 'DS-2026';

    INSERT INTO ems.course_materials (company_id, course_id, material_name, material_type, file_url, is_downloadable)
    SELECT v_company_id, c.id, 'Figma UI Components Kit', 'ZIP', 'https://storage.durkkas.com/materials/figma-components.fig', TRUE
    FROM ems.courses c WHERE c.course_code = 'UX-2026';

    INSERT INTO ems.course_materials (company_id, course_id, material_name, material_type, file_url, is_downloadable)
    SELECT v_company_id, c.id, 'UX Research Templates', 'PDF', 'https://storage.durkkas.com/materials/ux-research-templates.pdf', TRUE
    FROM ems.courses c WHERE c.course_code = 'UX-2026';

    -- ========================================================================
    -- 10. LIVE CLASSES
    -- ========================================================================
    INSERT INTO ems.live_classes (company_id, course_id, batch_id, tutor_id, class_title, class_description, scheduled_date, start_time, end_time, duration_minutes, meeting_link, class_status)
    SELECT v_company_id, c.id, b.id, e.id, 'React Hooks Deep Dive', 'Learn useState, useEffect, useRef and custom hooks with live examples.', '2026-06-15'::DATE, '09:00:00'::TIME, '11:00:00'::TIME, 120, 'https://meet.google.com/fsd-react-hooks', 'SCHEDULED'
    FROM ems.courses c, ems.batches b, core.employees e
    WHERE c.course_code = 'FS-2026' AND b.batch_code = 'FSD-BATCH-A' AND e.employee_code = 'TUT-001';

    INSERT INTO ems.live_classes (company_id, course_id, batch_id, tutor_id, class_title, class_description, scheduled_date, start_time, end_time, duration_minutes, meeting_link, class_status)
    SELECT v_company_id, c.id, b.id, e.id, 'Building REST APIs', 'Create RESTful APIs with Express, middleware, authentication and database integration.', '2026-06-22'::DATE, '09:00:00'::TIME, '11:00:00'::TIME, 120, 'https://meet.google.com/fsd-rest-api', 'SCHEDULED'
    FROM ems.courses c, ems.batches b, core.employees e
    WHERE c.course_code = 'FS-2026' AND b.batch_code = 'FSD-BATCH-A' AND e.employee_code = 'TUT-001';

    INSERT INTO ems.live_classes (company_id, course_id, batch_id, tutor_id, class_title, class_description, scheduled_date, start_time, end_time, duration_minutes, meeting_link, class_status)
    SELECT v_company_id, c.id, b.id, e.id, 'Python for Data Science', 'Introduction to Python, NumPy, Pandas for data manipulation.', '2026-06-17'::DATE, '10:00:00'::TIME, '12:30:00'::TIME, 150, 'https://meet.google.com/ds-python', 'SCHEDULED'
    FROM ems.courses c, ems.batches b, core.employees e
    WHERE c.course_code = 'DS-2026' AND b.batch_code = 'DSAI-BATCH-B' AND e.employee_code = 'TUT-002';

    INSERT INTO ems.live_classes (company_id, course_id, batch_id, tutor_id, class_title, class_description, scheduled_date, start_time, end_time, duration_minutes, meeting_link, class_status)
    SELECT v_company_id, c.id, b.id, e.id, 'ML Model Building Workshop', 'Build and evaluate machine learning models with scikit-learn.', '2026-06-24'::DATE, '10:00:00'::TIME, '13:00:00'::TIME, 180, 'https://meet.google.com/ds-ml-workshop', 'SCHEDULED'
    FROM ems.courses c, ems.batches b, core.employees e
    WHERE c.course_code = 'DS-2026' AND b.batch_code = 'DSAI-BATCH-B' AND e.employee_code = 'TUT-002';

    INSERT INTO ems.live_classes (company_id, course_id, batch_id, tutor_id, class_title, class_description, scheduled_date, start_time, end_time, duration_minutes, meeting_link, class_status)
    SELECT v_company_id, c.id, b.id, e.id, 'Design Thinking & UX Research', 'Learn user research methods, empathy mapping, and problem framing.', '2026-06-19'::DATE, '18:00:00'::TIME, '20:00:00'::TIME, 120, 'https://meet.google.com/ux-design-thinking', 'SCHEDULED'
    FROM ems.courses c, ems.batches b, core.employees e
    WHERE c.course_code = 'UX-2026' AND b.batch_code = 'UIUX-BATCH-C' AND e.employee_code = 'TUT-003';

    INSERT INTO ems.live_classes (company_id, course_id, batch_id, tutor_id, class_title, class_description, scheduled_date, start_time, end_time, duration_minutes, meeting_link, class_status)
    SELECT v_company_id, c.id, b.id, e.id, 'Figma Prototyping Masterclass', 'Create interactive prototypes with smart animate and variables.', '2026-06-26'::DATE, '18:00:00'::TIME, '20:00:00'::TIME, 120, 'https://meet.google.com/ux-figma-proto', 'SCHEDULED'
    FROM ems.courses c, ems.batches b, core.employees e
    WHERE c.course_code = 'UX-2026' AND b.batch_code = 'UIUX-BATCH-C' AND e.employee_code = 'TUT-003';

    -- ========================================================================
    -- 11. ATTENDANCE SESSIONS & RECORDS
    -- ========================================================================
    INSERT INTO ems.attendance_sessions (company_id, course_id, batch_id, session_date, session_type, status)
    SELECT v_company_id, c.id, b.id, '2026-06-10'::DATE, 'LECTURE', 'CLOSED'
    FROM ems.courses c, ems.batches b WHERE c.course_code = 'FS-2026' AND b.batch_code = 'FSD-BATCH-A';

    INSERT INTO ems.attendance_sessions (company_id, course_id, batch_id, session_date, session_type, status)
    SELECT v_company_id, c.id, b.id, '2026-06-11'::DATE, 'LECTURE', 'CLOSED'
    FROM ems.courses c, ems.batches b WHERE c.course_code = 'FS-2026' AND b.batch_code = 'FSD-BATCH-A';

    INSERT INTO ems.attendance_sessions (company_id, course_id, batch_id, session_date, session_type, status)
    SELECT v_company_id, c.id, b.id, '2026-06-12'::DATE, 'LECTURE', 'CLOSED'
    FROM ems.courses c, ems.batches b WHERE c.course_code = 'DS-2026' AND b.batch_code = 'DSAI-BATCH-B';

    INSERT INTO ems.attendance_sessions (company_id, course_id, batch_id, session_date, session_type, status)
    SELECT v_company_id, c.id, b.id, '2026-06-13'::DATE, 'LECTURE', 'CLOSED'
    FROM ems.courses c, ems.batches b WHERE c.course_code = 'UX-2026' AND b.batch_code = 'UIUX-BATCH-C';

    -- ========================================================================
    -- 12. CREATE 30 STUDENT USERS & PROFILES
    -- ========================================================================
    FOR v_i IN 1..30 LOOP
        v_email := 'student' || v_i || '@durkkas.com';
        v_first_name := CASE 
            WHEN v_i = 1 THEN 'Aarav' WHEN v_i = 2 THEN 'Vivaan' WHEN v_i = 3 THEN 'Aditya'
            WHEN v_i = 4 THEN 'Vihaan' WHEN v_i = 5 THEN 'Arjun' WHEN v_i = 6 THEN 'Sai'
            WHEN v_i = 7 THEN 'Arnav' WHEN v_i = 8 THEN 'Ayaan' WHEN v_i = 9 THEN 'Krishna'
            WHEN v_i = 10 THEN 'Ishaan' WHEN v_i = 11 THEN 'Ananya' WHEN v_i = 12 THEN 'Diya'
            WHEN v_i = 13 THEN 'Aadhya' WHEN v_i = 14 THEN 'Kiara' WHEN v_i = 15 THEN 'Saanvi'
            WHEN v_i = 16 THEN 'Anika' WHEN v_i = 17 THEN 'Pari' WHEN v_i = 18 THEN 'Navya'
            WHEN v_i = 19 THEN 'Angel' WHEN v_i = 20 THEN 'Ira' WHEN v_i = 21 THEN 'Rohan'
            WHEN v_i = 22 THEN 'Kabir' WHEN v_i = 23 THEN 'Reyansh' WHEN v_i = 24 THEN 'Shaurya'
            WHEN v_i = 25 THEN 'Atharv' WHEN v_i = 26 THEN 'Advait' WHEN v_i = 27 THEN 'Pranav'
            WHEN v_i = 28 THEN 'Dhruv' WHEN v_i = 29 THEN 'Kian' WHEN v_i = 30 THEN 'Vedant'
        END;
        v_last_name := CASE 
            WHEN v_i = 1 THEN 'Sharma' WHEN v_i = 2 THEN 'Verma' WHEN v_i = 3 THEN 'Patel'
            WHEN v_i = 4 THEN 'Kumar' WHEN v_i = 5 THEN 'Singh' WHEN v_i = 6 THEN 'Reddy'
            WHEN v_i = 7 THEN 'Nair' WHEN v_i = 8 THEN 'Iyer' WHEN v_i = 9 THEN 'Gupta'
            WHEN v_i = 10 THEN 'Joshi' WHEN v_i = 11 THEN 'Mehta' WHEN v_i = 12 THEN 'Desai'
            WHEN v_i = 13 THEN 'Kulkarni' WHEN v_i = 14 THEN 'Rao' WHEN v_i = 15 THEN 'Pillai'
            WHEN v_i = 16 THEN 'Menon' WHEN v_i = 17 THEN 'Shetty' WHEN v_i = 18 THEN 'Naidu'
            WHEN v_i = 19 THEN 'Das' WHEN v_i = 20 THEN 'Bose' WHEN v_i = 21 THEN 'Choudhury'
            WHEN v_i = 22 THEN 'Malhotra' WHEN v_i = 23 THEN 'Kapoor' WHEN v_i = 24 THEN 'Khanna'
            WHEN v_i = 25 THEN 'Agarwal' WHEN v_i = 26 THEN 'Bansal' WHEN v_i = 27 THEN 'Chopra'
            WHEN v_i = 28 THEN 'Sethi' WHEN v_i = 29 THEN 'Arora' WHEN v_i = 30 THEN 'Bhatt'
        END;

        -- Create auth user
        INSERT INTO app_auth.users (email, password_hash, first_name, last_name, display_name, is_active, is_verified)
        VALUES (v_email, '$2a$10$kzgTk1M2qRd518SAE2oWTeE3Ru7a7.OvwxWSCYl3fnwtPYFvkdIsu',
                v_first_name, v_last_name, v_first_name || ' ' || v_last_name, TRUE, TRUE)
        ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, is_active = TRUE
        RETURNING id INTO v_student_user_id;

        -- Assign STUDENT role
        DELETE FROM app_auth.user_roles WHERE user_id = v_student_user_id AND role_id = v_student_role_id;
        INSERT INTO app_auth.user_roles (user_id, role_id, company_id, branch_id, is_active)
        VALUES (v_student_user_id, v_student_role_id, v_company_id, v_branch_id, TRUE);

        -- Create student profile
        INSERT INTO ems.students (company_id, branch_id, user_id, student_code, first_name, last_name, email, phone, status, is_active)
        VALUES (v_company_id, v_branch_id, v_student_user_id, 'DARE-2026-' || LPAD(v_i::TEXT, 3, '0'),
                v_first_name, v_last_name, v_email, '+91-9000000' || LPAD(v_i::TEXT, 3, '0'), 'ACTIVE', TRUE)
        ON CONFLICT (company_id, student_code) DO UPDATE SET user_id = EXCLUDED.user_id, is_active = TRUE
        RETURNING id INTO v_student_id;

        v_student_ids := array_append(v_student_ids, v_student_id);

        -- Determine batch: 1-10 -> Batch A (FS), 11-20 -> Batch B (DS), 21-30 -> Batch C (UX)
        v_batch_idx := CASE WHEN v_i <= 10 THEN 1 WHEN v_i <= 20 THEN 2 ELSE 3 END;

        -- Enroll student in course + batch
        INSERT INTO ems.student_enrollments (company_id, student_id, course_id, batch_id, enrollment_date, enrollment_status, payment_status, completion_percentage)
        VALUES (v_company_id, v_student_id, v_course_ids[v_batch_idx], v_batch_ids[v_batch_idx], '2026-06-01'::DATE, 'ACTIVE', 'PAID', 
                CASE WHEN v_i <= 10 THEN 25.00 WHEN v_i <= 20 THEN 20.00 ELSE 15.00 END)
        ON CONFLICT (company_id, student_id, course_id, batch_id) DO UPDATE SET enrollment_status = 'ACTIVE'
        RETURNING id INTO v_enroll_id;

        -- ====================================================================
        -- 13. QUIZ ATTEMPTS (students in Batch A take React quiz)
        -- ====================================================================
        IF v_i <= 10 THEN
            SELECT qz.id INTO v_quiz_id FROM ems.quizzes qz 
            JOIN ems.courses c ON c.id = qz.course_id 
            WHERE c.course_code = 'FS-2026' AND qz.quiz_title = 'React Fundamentals Assessment'
            LIMIT 1;

            INSERT INTO ems.quiz_attempts (company_id, quiz_id, student_id, attempt_number, started_at, completed_at, time_taken_minutes, total_questions, correct_answers, wrong_answers, unanswered, marks_obtained, percentage, is_passed, status)
            VALUES (v_company_id, v_quiz_id, v_student_id, 1, '2026-06-05 10:00:00'::TIMESTAMPTZ, '2026-06-05 10:45:00'::TIMESTAMPTZ, 45, 5, 
                    CASE WHEN v_i = 1 THEN 2 WHEN v_i = 2 THEN 3 WHEN v_i = 3 THEN 3 WHEN v_i = 4 THEN 3 WHEN v_i = 5 THEN 4 WHEN v_i = 6 THEN 4 WHEN v_i = 7 THEN 4 WHEN v_i = 8 THEN 4 WHEN v_i = 9 THEN 5 WHEN v_i = 10 THEN 5 END,
                    CASE WHEN v_i = 1 THEN 3 WHEN v_i = 2 THEN 2 WHEN v_i = 3 THEN 2 WHEN v_i = 4 THEN 2 WHEN v_i = 5 THEN 1 WHEN v_i = 6 THEN 1 WHEN v_i = 7 THEN 1 WHEN v_i = 8 THEN 1 WHEN v_i = 9 THEN 0 WHEN v_i = 10 THEN 0 END,
                    0,
                    CASE WHEN v_i = 1 THEN 20 WHEN v_i = 2 THEN 30 WHEN v_i = 3 THEN 30 WHEN v_i = 4 THEN 30 WHEN v_i = 5 THEN 40 WHEN v_i = 6 THEN 40 WHEN v_i = 7 THEN 40 WHEN v_i = 8 THEN 40 WHEN v_i = 9 THEN 50 WHEN v_i = 10 THEN 50 END,
                    CASE WHEN v_i = 1 THEN 40 WHEN v_i = 2 THEN 60 WHEN v_i = 3 THEN 60 WHEN v_i = 4 THEN 60 WHEN v_i = 5 THEN 80 WHEN v_i = 6 THEN 80 WHEN v_i = 7 THEN 80 WHEN v_i = 8 THEN 80 WHEN v_i = 9 THEN 100 WHEN v_i = 10 THEN 100 END,
                    CASE WHEN v_i <= 4 THEN FALSE ELSE TRUE END, 'COMPLETED')
            ON CONFLICT DO NOTHING
            RETURNING id INTO v_attempt_id;
        END IF;

        -- ====================================================================
        -- 14. ATTENDANCE RECORDS
        -- ====================================================================
        -- Mark attendance for session 1 (Batch A - FSD)
        IF v_i <= 10 THEN
            INSERT INTO ems.attendance_records (company_id, session_id, student_id, check_in_time, status)
            SELECT v_company_id, as1.id, v_student_id, '2026-06-10 09:00:00'::TIMESTAMPTZ, 
                   CASE WHEN v_i IN (9, 10) THEN 'ABSENT' ELSE 'PRESENT' END
            FROM ems.attendance_sessions as1
            JOIN ems.batches b ON b.id = as1.batch_id
            WHERE b.batch_code = 'FSD-BATCH-A' AND as1.session_date = '2026-06-10'::DATE
            LIMIT 1;

            INSERT INTO ems.attendance_records (company_id, session_id, student_id, check_in_time, status)
            SELECT v_company_id, as1.id, v_student_id, '2026-06-11 09:00:00'::TIMESTAMPTZ, 'PRESENT'
            FROM ems.attendance_sessions as1
            JOIN ems.batches b ON b.id = as1.batch_id
            WHERE b.batch_code = 'FSD-BATCH-A' AND as1.session_date = '2026-06-11'::DATE
            LIMIT 1;
        END IF;

        -- Mark attendance for session 3 (Batch B - DS)
        IF v_i > 10 AND v_i <= 20 THEN
            INSERT INTO ems.attendance_records (company_id, session_id, student_id, check_in_time, status)
            SELECT v_company_id, as1.id, v_student_id, '2026-06-12 10:00:00'::TIMESTAMPTZ, 
                   CASE WHEN v_i IN (19, 20) THEN 'ABSENT' ELSE 'PRESENT' END
            FROM ems.attendance_sessions as1
            JOIN ems.batches b ON b.id = as1.batch_id
            WHERE b.batch_code = 'DSAI-BATCH-B' AND as1.session_date = '2026-06-12'::DATE
            LIMIT 1;
        END IF;

        -- Mark attendance for session 4 (Batch C - UX)
        IF v_i > 20 THEN
            INSERT INTO ems.attendance_records (company_id, session_id, student_id, check_in_time, status)
            SELECT v_company_id, as1.id, v_student_id, '2026-06-13 18:00:00'::TIMESTAMPTZ, 
                   CASE WHEN v_i IN (29, 30) THEN 'ABSENT' ELSE 'PRESENT' END
            FROM ems.attendance_sessions as1
            JOIN ems.batches b ON b.id = as1.batch_id
            WHERE b.batch_code = 'UIUX-BATCH-C' AND as1.session_date = '2026-06-13'::DATE
            LIMIT 1
            ON CONFLICT DO NOTHING;
        END IF;
    END LOOP;

    -- Update batch current_strength
    UPDATE ems.batches SET current_strength = 10 WHERE batch_code = 'FSD-BATCH-A' AND company_id = v_company_id;
    UPDATE ems.batches SET current_strength = 10 WHERE batch_code = 'DSAI-BATCH-B' AND company_id = v_company_id;
    UPDATE ems.batches SET current_strength = 10 WHERE batch_code = 'UIUX-BATCH-C' AND company_id = v_company_id;

    RAISE NOTICE '==========================================';
    RAISE NOTICE '✅ SEED COMPLETE';
    RAISE NOTICE '==========================================';
    RAISE NOTICE 'Academic Manager: manager@durkkas.com / Durk@123';
    RAISE NOTICE '5 Tutors created (rajesh.kumar@durkkas.com etc)';
    RAISE NOTICE '30 Students created (student1-30@durkkas.com)';
    RAISE NOTICE '3 Courses, 3 Batches, 6 Assignments, 6 Quizzes';
    RAISE NOTICE '8 Materials, 6 Live Classes, 4 Attendance Sessions';
    RAISE NOTICE '==========================================';
END $$;

-- ============================================================================
-- VERIFICATION
-- ============================================================================
SELECT 'Academic Manager Login' AS check_item, 
       CASE WHEN EXISTS (SELECT 1 FROM app_auth.users WHERE email = 'manager@durkkas.com') 
            THEN '✅ EXISTS' ELSE '❌ MISSING' END AS status
UNION ALL
SELECT 'Tutor Accounts', 
       CASE WHEN (SELECT COUNT(*) FROM app_auth.users WHERE email LIKE '%.kumar@durkkas.com' OR email LIKE '%.sharma@durkkas.com' OR email LIKE '%.patel@durkkas.com' OR email LIKE '%.reddy@durkkas.com' OR email LIKE '%.singh@durkkas.com') >= 5
            THEN '✅ 5 TUTORS' ELSE '❌ MISSING' END
UNION ALL
SELECT 'Student Accounts', 
       CASE WHEN (SELECT COUNT(*) FROM ems.students WHERE email LIKE 'student%@durkkas.com') = 30
            THEN '✅ 30 STUDENTS' ELSE '❌ FOUND: ' || (SELECT COUNT(*)::TEXT FROM ems.students WHERE email LIKE 'student%@durkkas.com') END
UNION ALL
SELECT 'Courses', 
       CASE WHEN (SELECT COUNT(*) FROM ems.courses WHERE company_id = (SELECT id FROM core.companies WHERE code = 'DIPL')) >= 3
            THEN '✅ 3+ COURSES' ELSE '❌ ' || (SELECT COUNT(*)::TEXT FROM ems.courses WHERE company_id = (SELECT id FROM core.companies WHERE code = 'DIPL')) END
UNION ALL
SELECT 'Batches', 
       CASE WHEN (SELECT COUNT(*) FROM ems.batches WHERE company_id = (SELECT id FROM core.companies WHERE code = 'DIPL')) >= 3
            THEN '✅ 3+ BATCHES' ELSE '❌ MISSING' END
UNION ALL
SELECT 'Assignments', 
       CASE WHEN (SELECT COUNT(*) FROM ems.assignments WHERE company_id = (SELECT id FROM core.companies WHERE code = 'DIPL')) >= 6
            THEN '✅ 6+ ASSIGNMENTS' ELSE '❌ MISSING' END
UNION ALL
SELECT 'Quizzes', 
       CASE WHEN (SELECT COUNT(*) FROM ems.quizzes WHERE company_id = (SELECT id FROM core.companies WHERE code = 'DIPL')) >= 6
            THEN '✅ 6+ QUIZZES' ELSE '❌ MISSING' END
UNION ALL
SELECT 'Quiz Questions', 
       CASE WHEN (SELECT COUNT(*) FROM ems.quiz_questions WHERE company_id = (SELECT id FROM core.companies WHERE code = 'DIPL')) >= 5
            THEN '✅ 5+ QUESTIONS' ELSE '❌ MISSING' END
UNION ALL
SELECT 'Materials', 
       CASE WHEN (SELECT COUNT(*) FROM ems.course_materials WHERE company_id = (SELECT id FROM core.companies WHERE code = 'DIPL')) >= 8
            THEN '✅ 8+ MATERIALS' ELSE '❌ MISSING' END
UNION ALL
SELECT 'Live Classes', 
       CASE WHEN (SELECT COUNT(*) FROM ems.live_classes WHERE company_id = (SELECT id FROM core.companies WHERE code = 'DIPL')) >= 6
            THEN '✅ 6+ LIVE CLASSES' ELSE '❌ MISSING' END
UNION ALL
SELECT 'Attendance Records', 
       CASE WHEN (SELECT COUNT(*) FROM ems.attendance_records WHERE company_id = (SELECT id FROM core.companies WHERE code = 'DIPL')) >= 30
            THEN '✅ 30+ ATTENDANCE' ELSE '❌ MISSING' END
UNION ALL
SELECT 'Enrollments', 
       CASE WHEN (SELECT COUNT(*) FROM ems.student_enrollments WHERE company_id = (SELECT id FROM core.companies WHERE code = 'DIPL')) = 30
            THEN '✅ 30 ENROLLMENTS' ELSE '❌ FOUND: ' || (SELECT COUNT(*)::TEXT FROM ems.student_enrollments WHERE company_id = (SELECT id FROM core.companies WHERE code = 'DIPL')) END
UNION ALL
SELECT 'Quiz Attempts', 
       CASE WHEN (SELECT COUNT(*) FROM ems.quiz_attempts WHERE company_id = (SELECT id FROM core.companies WHERE code = 'DIPL')) >= 10
            THEN '✅ 10+ ATTEMPTS' ELSE '❌ MISSING' END;
