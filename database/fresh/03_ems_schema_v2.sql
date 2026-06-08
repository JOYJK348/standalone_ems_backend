-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 04 - EMS SCHEMA V2 (EDUCATION MANAGEMENT SYSTEM)
-- Durkkas Innovations Private Limited
-- Multi-Tenant SaaS | Production-Ready | Enterprise Grade
-- Total Tables: 32 | Soft Delete | Full Audit Trail
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DROP SCHEMA IF EXISTS ems CASCADE;
CREATE SCHEMA ems;
SET search_path TO ems, core, app_auth, public;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- PART 1: STUDENT & GUARDIAN TABLES
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- 1. STUDENTS
CREATE TABLE ems.students (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
    branch_id BIGINT REFERENCES core.branches(id),
    user_id BIGINT REFERENCES app_auth.users(id),
    
    student_code VARCHAR(50) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    middle_name VARCHAR(100),
    last_name VARCHAR(100),
    date_of_birth DATE,
    gender VARCHAR(20),
    email VARCHAR(255),
    phone VARCHAR(20),
    
    address_line1 TEXT,
    address_line2 TEXT,
    city VARCHAR(100),
    state VARCHAR(100),
    country VARCHAR(100) DEFAULT 'India',
    postal_code VARCHAR(20),
    
    profile_url TEXT,
    status VARCHAR(50) DEFAULT 'ACTIVE',
    is_active BOOLEAN DEFAULT TRUE,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by BIGINT,
    updated_by BIGINT,
    deleted_at TIMESTAMPTZ,
    deleted_by BIGINT,
    delete_reason TEXT,
    
    UNIQUE(company_id, student_code)
);

-- 2. STUDENT GUARDIANS
CREATE TABLE ems.student_guardians (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
    student_id BIGINT NOT NULL REFERENCES ems.students(id) ON DELETE CASCADE,
    
    guardian_name VARCHAR(255) NOT NULL,
    relationship VARCHAR(50),
    phone VARCHAR(20),
    email VARCHAR(255),
    occupation VARCHAR(100),
    address TEXT,
    is_primary BOOLEAN DEFAULT FALSE,
    is_emergency_contact BOOLEAN DEFAULT FALSE,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by BIGINT,
    updated_by BIGINT,
    deleted_at TIMESTAMPTZ,
    deleted_by BIGINT,
    delete_reason TEXT
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- PART 2: COURSE MANAGEMENT TABLES
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- 3. COURSES
CREATE TABLE ems.courses (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
    branch_id BIGINT REFERENCES core.branches(id),
    tutor_id BIGINT REFERENCES core.employees(id),
    
    course_code VARCHAR(50) NOT NULL,
    course_name VARCHAR(255) NOT NULL,
    course_description TEXT,
    course_category VARCHAR(100),
    course_level VARCHAR(50),
    course_type VARCHAR(50),
    
    duration_hours INTEGER,
    total_lessons INTEGER DEFAULT 0,
    enrollment_capacity INTEGER,
    price NUMERIC(12,2) DEFAULT 0.00,
    
    thumbnail_url TEXT,
    syllabus_url TEXT,
    start_date DATE,
    end_date DATE,
    
    is_published BOOLEAN DEFAULT FALSE,
    status VARCHAR(50) DEFAULT 'DRAFT',
    is_active BOOLEAN DEFAULT TRUE,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by BIGINT,
    updated_by BIGINT,
    deleted_at TIMESTAMPTZ,
    deleted_by BIGINT,
    delete_reason TEXT,
    
    UNIQUE(company_id, course_code)
);

-- 4. COURSE MODULES
CREATE TABLE ems.course_modules (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
    course_id BIGINT NOT NULL REFERENCES ems.courses(id) ON DELETE CASCADE,
    parent_module_id BIGINT REFERENCES ems.course_modules(id),
    
    module_name VARCHAR(255) NOT NULL,
    module_description TEXT,
    module_order INTEGER DEFAULT 0,
    duration_hours NUMERIC(5,2),
    is_mandatory BOOLEAN DEFAULT TRUE,
    is_active BOOLEAN DEFAULT TRUE,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by BIGINT,
    updated_by BIGINT,
    deleted_at TIMESTAMPTZ,
    deleted_by BIGINT,
    delete_reason TEXT
);

-- 5. LESSONS
CREATE TABLE ems.lessons (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
    course_id BIGINT NOT NULL REFERENCES ems.courses(id) ON DELETE CASCADE,
    module_id BIGINT REFERENCES ems.course_modules(id),
    
    lesson_name VARCHAR(255) NOT NULL,
    lesson_description TEXT,
    lesson_type VARCHAR(50),
    lesson_order INTEGER DEFAULT 0,
    duration_minutes INTEGER,
    video_url TEXT,
    is_preview BOOLEAN DEFAULT FALSE,
    is_mandatory BOOLEAN DEFAULT TRUE,
    is_active BOOLEAN DEFAULT TRUE,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by BIGINT,
    updated_by BIGINT,
    deleted_at TIMESTAMPTZ,
    deleted_by BIGINT,
    delete_reason TEXT
);

-- 6. COURSE MATERIALS
CREATE TABLE ems.course_materials (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
    course_id BIGINT NOT NULL REFERENCES ems.courses(id) ON DELETE CASCADE,
    lesson_id BIGINT REFERENCES ems.lessons(id),
    
    material_name VARCHAR(255) NOT NULL,
    material_type VARCHAR(50),
    file_url TEXT,
    file_size_mb NUMERIC(10,2),
    is_downloadable BOOLEAN DEFAULT TRUE,
    is_active BOOLEAN DEFAULT TRUE,
    
    uploaded_by BIGINT,
    uploaded_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    deleted_by BIGINT,
    delete_reason TEXT
);

-- 7. BATCHES
CREATE TABLE ems.batches (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
    branch_id BIGINT REFERENCES core.branches(id),
    course_id BIGINT NOT NULL REFERENCES ems.courses(id) ON DELETE CASCADE,
    
    batch_code VARCHAR(50) NOT NULL,
    batch_name VARCHAR(255) NOT NULL,
    batch_type VARCHAR(50),
    
    start_date DATE,
    end_date DATE,
    start_time TIME,
    end_time TIME,
    
    max_students INTEGER,
    current_strength INTEGER DEFAULT 0,
    status VARCHAR(50) DEFAULT 'PLANNED',
    is_active BOOLEAN DEFAULT TRUE,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by BIGINT,
    updated_by BIGINT,
    deleted_at TIMESTAMPTZ,
    deleted_by BIGINT,
    delete_reason TEXT,
    
    UNIQUE(company_id, batch_code)
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- PART 3: ENROLLMENT & PROGRESS TABLES
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- 8. STUDENT ENROLLMENTS
CREATE TABLE ems.student_enrollments (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
    student_id BIGINT NOT NULL REFERENCES ems.students(id) ON DELETE CASCADE,
    course_id BIGINT NOT NULL REFERENCES ems.courses(id) ON DELETE CASCADE,
    batch_id BIGINT REFERENCES ems.batches(id),
    
    enrollment_date DATE DEFAULT CURRENT_DATE,
    enrollment_status VARCHAR(50) DEFAULT 'ACTIVE',
    payment_status VARCHAR(50) DEFAULT 'PENDING',
    payment_amount NUMERIC(12,2),
    
    completion_percentage NUMERIC(5,2) DEFAULT 0,
    total_lessons INTEGER DEFAULT 0,
    lessons_completed INTEGER DEFAULT 0,
    
    last_accessed_at TIMESTAMPTZ,
    expected_completion_date DATE,
    actual_completion_date DATE,
    
    certificate_issued BOOLEAN DEFAULT FALSE,
    certificate_url TEXT,
    enrolled_by BIGINT,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by BIGINT,
    updated_by BIGINT,
    deleted_at TIMESTAMPTZ,
    deleted_by BIGINT,
    delete_reason TEXT,
    
    UNIQUE(company_id, student_id, course_id, batch_id)
);

-- 9. LESSON PROGRESS
CREATE TABLE ems.lesson_progress (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
    student_id BIGINT NOT NULL REFERENCES ems.students(id) ON DELETE CASCADE,
    enrollment_id BIGINT NOT NULL REFERENCES ems.student_enrollments(id) ON DELETE CASCADE,
    lesson_id BIGINT NOT NULL REFERENCES ems.lessons(id) ON DELETE CASCADE,
    course_id BIGINT NOT NULL REFERENCES ems.courses(id) ON DELETE CASCADE,
    
    is_completed BOOLEAN DEFAULT FALSE,
    completion_percentage NUMERIC(5,2) DEFAULT 0,
    time_spent_minutes INTEGER DEFAULT 0,
    
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    last_accessed_at TIMESTAMPTZ,
    notes TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- PART 4: LIVE CLASSES & ATTENDANCE
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- 10. LIVE CLASSES
CREATE TABLE ems.live_classes (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
    course_id BIGINT NOT NULL REFERENCES ems.courses(id) ON DELETE CASCADE,
    batch_id BIGINT REFERENCES ems.batches(id),
    lesson_id BIGINT REFERENCES ems.lessons(id),
    tutor_id BIGINT REFERENCES core.employees(id),
    
    class_title VARCHAR(255) NOT NULL,
    class_description TEXT,
    scheduled_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME,
    duration_minutes INTEGER,
    
    meeting_platform VARCHAR(50),
    meeting_link TEXT,
    meeting_id VARCHAR(255),
    meeting_password VARCHAR(100),
    
    recording_url TEXT,
    recording_duration_minutes INTEGER,
    
    class_status VARCHAR(50) DEFAULT 'SCHEDULED',
    max_attendees INTEGER,
    attendees_count INTEGER DEFAULT 0,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by BIGINT,
    updated_by BIGINT,
    deleted_at TIMESTAMPTZ,
    deleted_by BIGINT,
    delete_reason TEXT
);

-- 11. LIVE CLASS ATTENDANCE
CREATE TABLE ems.live_class_attendance (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
    live_class_id BIGINT NOT NULL REFERENCES ems.live_classes(id) ON DELETE CASCADE,
    student_id BIGINT NOT NULL REFERENCES ems.students(id) ON DELETE CASCADE,
    enrollment_id BIGINT REFERENCES ems.student_enrollments(id),
    
    join_time TIMESTAMPTZ,
    leave_time TIMESTAMPTZ,
    duration_minutes INTEGER,
    attendance_status VARCHAR(50) DEFAULT 'ABSENT',
    
    ip_address VARCHAR(45),
    device_info TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- PART 5: ASSIGNMENTS & SUBMISSIONS
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- 12. ASSIGNMENTS
CREATE TABLE ems.assignments (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
    course_id BIGINT NOT NULL REFERENCES ems.courses(id) ON DELETE CASCADE,
    batch_id BIGINT REFERENCES ems.batches(id) ON DELETE CASCADE,
    module_id BIGINT REFERENCES ems.course_modules(id),
    lesson_id BIGINT REFERENCES ems.lessons(id),
    tutor_id BIGINT REFERENCES core.employees(id),
    
    assignment_title VARCHAR(255) NOT NULL,
    assignment_description TEXT,
    assignment_type VARCHAR(50),
    submission_mode VARCHAR(20) DEFAULT 'ONLINE', -- 'ONLINE' or 'OFFLINE'
    
    max_marks INTEGER,
    passing_marks INTEGER,
    difficulty_level VARCHAR(50),
    
    instruction_file_url TEXT,
    deadline TIMESTAMPTZ,
    allow_late_submission BOOLEAN DEFAULT FALSE,
    late_penalty_percentage NUMERIC(5,2) DEFAULT 0,
    
    is_mandatory BOOLEAN DEFAULT TRUE,
    submission_format VARCHAR(100),
    max_file_size_mb INTEGER,
    is_active BOOLEAN DEFAULT TRUE,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by BIGINT,
    updated_by BIGINT,
    deleted_at TIMESTAMPTZ,
    deleted_by BIGINT,
    delete_reason TEXT
);

-- 13. ASSIGNMENT SUBMISSIONS
CREATE TABLE ems.assignment_submissions (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
    assignment_id BIGINT NOT NULL REFERENCES ems.assignments(id) ON DELETE CASCADE,
    student_id BIGINT NOT NULL REFERENCES ems.students(id) ON DELETE CASCADE,
    enrollment_id BIGINT REFERENCES ems.student_enrollments(id),
    
    submission_number INTEGER DEFAULT 1,
    submitted_at TIMESTAMPTZ DEFAULT NOW(),
    submission_text TEXT,
    submission_file_url TEXT,
    submission_link TEXT,
    file_name VARCHAR(255),
    file_size_mb NUMERIC(10,2),
    
    is_late BOOLEAN DEFAULT FALSE,
    late_by_hours INTEGER,
    submission_status VARCHAR(50) DEFAULT 'SUBMITTED',
    
    marks_obtained NUMERIC(5,2),
    grade VARCHAR(10),
    tutor_feedback TEXT,
    graded_by BIGINT,
    graded_at TIMESTAMPTZ,
    
    requires_resubmission BOOLEAN DEFAULT FALSE,
    resubmission_reason TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- PART 6: QUIZ SYSTEM (NEW)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- 14. QUIZZES
CREATE TABLE ems.quizzes (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
    course_id BIGINT NOT NULL REFERENCES ems.courses(id) ON DELETE CASCADE,
    module_id BIGINT REFERENCES ems.course_modules(id),
    lesson_id BIGINT REFERENCES ems.lessons(id),
    
    quiz_title VARCHAR(255) NOT NULL,
    quiz_description TEXT,
    quiz_type VARCHAR(50),
    
    total_questions INTEGER DEFAULT 0,
    total_marks INTEGER,
    passing_marks INTEGER,
    duration_minutes INTEGER,
    
    start_datetime TIMESTAMPTZ,
    end_datetime TIMESTAMPTZ,
    max_attempts INTEGER DEFAULT 1,
    
    shuffle_questions BOOLEAN DEFAULT FALSE,
    show_answers_after BOOLEAN DEFAULT TRUE,
    is_active BOOLEAN DEFAULT TRUE,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by BIGINT,
    updated_by BIGINT,
    deleted_at TIMESTAMPTZ,
    deleted_by BIGINT,
    delete_reason TEXT
);

-- 15. QUIZ QUESTIONS
CREATE TABLE ems.quiz_questions (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
    quiz_id BIGINT NOT NULL REFERENCES ems.quizzes(id) ON DELETE CASCADE,
    
    question_text TEXT NOT NULL,
    question_type VARCHAR(50),
    question_order INTEGER DEFAULT 0,
    marks INTEGER DEFAULT 1,
    
    explanation TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 16. QUIZ OPTIONS
CREATE TABLE ems.quiz_options (
    id BIGSERIAL PRIMARY KEY,
    question_id BIGINT NOT NULL REFERENCES ems.quiz_questions(id) ON DELETE CASCADE,
    
    option_text TEXT NOT NULL,
    option_order INTEGER DEFAULT 0,
    is_correct BOOLEAN DEFAULT FALSE,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 17. QUIZ ATTEMPTS
CREATE TABLE ems.quiz_attempts (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
    quiz_id BIGINT NOT NULL REFERENCES ems.quizzes(id) ON DELETE CASCADE,
    student_id BIGINT NOT NULL REFERENCES ems.students(id) ON DELETE CASCADE,
    enrollment_id BIGINT REFERENCES ems.student_enrollments(id),
    
    attempt_number INTEGER DEFAULT 1,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    time_taken_minutes INTEGER,
    
    total_questions INTEGER,
    correct_answers INTEGER DEFAULT 0,
    wrong_answers INTEGER DEFAULT 0,
    unanswered INTEGER DEFAULT 0,
    
    marks_obtained NUMERIC(5,2),
    percentage NUMERIC(5,2),
    is_passed BOOLEAN DEFAULT FALSE,
    
    status VARCHAR(50) DEFAULT 'IN_PROGRESS',
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 18. QUIZ RESPONSES
CREATE TABLE ems.quiz_responses (
    id BIGSERIAL PRIMARY KEY,
    attempt_id BIGINT NOT NULL REFERENCES ems.quiz_attempts(id) ON DELETE CASCADE,
    question_id BIGINT NOT NULL REFERENCES ems.quiz_questions(id) ON DELETE CASCADE,
    selected_option_id BIGINT REFERENCES ems.quiz_options(id),
    
    text_response TEXT,
    is_correct BOOLEAN,
    marks_awarded NUMERIC(5,2),
    
    answered_at TIMESTAMPTZ DEFAULT NOW()
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- PART 7: GRADING & FEEDBACK
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- 19. GRADE BOOK
CREATE TABLE ems.grade_book (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
    student_id BIGINT NOT NULL REFERENCES ems.students(id) ON DELETE CASCADE,
    enrollment_id BIGINT NOT NULL REFERENCES ems.student_enrollments(id) ON DELETE CASCADE,
    course_id BIGINT NOT NULL REFERENCES ems.courses(id) ON DELETE CASCADE,
    
    total_assignments INTEGER DEFAULT 0,
    completed_assignments INTEGER DEFAULT 0,
    average_marks NUMERIC(5,2),
    total_marks_obtained NUMERIC(10,2),
    total_max_marks NUMERIC(10,2),
    percentage NUMERIC(5,2),
    final_grade VARCHAR(10),
    rank INTEGER,
    total_students INTEGER,
    remarks TEXT,
    
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 20. TUTOR FEEDBACK
CREATE TABLE ems.tutor_feedback (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
    student_id BIGINT NOT NULL REFERENCES ems.students(id) ON DELETE CASCADE,
    course_id BIGINT NOT NULL REFERENCES ems.courses(id) ON DELETE CASCADE,
    tutor_id BIGINT REFERENCES core.employees(id),
    
    feedback_type VARCHAR(50),
    feedback_text TEXT,
    strengths TEXT,
    improvements_needed TEXT,
    rating INTEGER,
    is_private BOOLEAN DEFAULT TRUE,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- PART 8: FEE MANAGEMENT
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- 21. FEE STRUCTURE
CREATE TABLE ems.fee_structure (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
    course_id BIGINT NOT NULL REFERENCES ems.courses(id) ON DELETE CASCADE,
    batch_id BIGINT REFERENCES ems.batches(id),
    
    fee_name VARCHAR(255) NOT NULL,
    fee_type VARCHAR(50),
    amount NUMERIC(12,2) NOT NULL,
    due_date DATE,
    
    is_mandatory BOOLEAN DEFAULT TRUE,
    is_active BOOLEAN DEFAULT TRUE,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by BIGINT,
    updated_by BIGINT,
    deleted_at TIMESTAMPTZ,
    deleted_by BIGINT,
    delete_reason TEXT
);

-- 22. FEE PAYMENTS
CREATE TABLE ems.fee_payments (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
    student_id BIGINT NOT NULL REFERENCES ems.students(id) ON DELETE CASCADE,
    enrollment_id BIGINT REFERENCES ems.student_enrollments(id),
    fee_structure_id BIGINT REFERENCES ems.fee_structure(id),
    
    payment_date DATE DEFAULT CURRENT_DATE,
    amount_paid NUMERIC(12,2) NOT NULL,
    payment_method VARCHAR(50),
    transaction_id VARCHAR(255),
    receipt_number VARCHAR(100),
    receipt_url TEXT,
    
    payment_status VARCHAR(50) DEFAULT 'COMPLETED',
    remarks TEXT,
    
    received_by BIGINT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- PART 9: NOTIFICATIONS
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- 23. NOTIFICATIONS
CREATE TABLE ems.notifications (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
    user_id BIGINT REFERENCES app_auth.users(id),
    student_id BIGINT REFERENCES ems.students(id),
    tutor_id BIGINT REFERENCES core.employees(id),
    
    notification_type VARCHAR(50),
    title VARCHAR(255) NOT NULL,
    message TEXT,
    
    reference_type VARCHAR(50),
    reference_id BIGINT,
    priority VARCHAR(20) DEFAULT 'MEDIUM',
    
    is_read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMPTZ,
    sent_via VARCHAR(50) DEFAULT 'IN_APP',
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 24. TUTOR ANNOUNCEMENTS
CREATE TABLE ems.tutor_announcements (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
    tutor_id BIGINT REFERENCES core.employees(id),
    course_id BIGINT REFERENCES ems.courses(id),
    batch_id BIGINT REFERENCES ems.batches(id),
    
    announcement_title VARCHAR(255) NOT NULL,
    announcement_content TEXT,
    announcement_type VARCHAR(50),
    attachment_url TEXT,
    
    is_pinned BOOLEAN DEFAULT FALSE,
    send_email BOOLEAN DEFAULT FALSE,
    send_notification BOOLEAN DEFAULT TRUE,
    view_count INTEGER DEFAULT 0,
    
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    deleted_by BIGINT,
    delete_reason TEXT
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- PART 10: ANALYTICS & REPORTS
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- 25. COURSE ANALYTICS
CREATE TABLE ems.course_analytics (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
    course_id BIGINT NOT NULL REFERENCES ems.courses(id) ON DELETE CASCADE,
    
    total_enrollments INTEGER DEFAULT 0,
    active_students INTEGER DEFAULT 0,
    completed_students INTEGER DEFAULT 0,
    dropped_students INTEGER DEFAULT 0,
    
    average_completion_time_days INTEGER,
    average_score NUMERIC(5,2),
    total_assignments INTEGER DEFAULT 0,
    average_submission_rate NUMERIC(5,2),
    
    total_live_classes INTEGER DEFAULT 0,
    average_attendance_rate NUMERIC(5,2),
    
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 26. STUDENT ACTIVITY LOG
CREATE TABLE ems.student_activity_log (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
    student_id BIGINT NOT NULL REFERENCES ems.students(id) ON DELETE CASCADE,
    course_id BIGINT REFERENCES ems.courses(id),
    
    activity_type VARCHAR(50),
    activity_description TEXT,
    
    lesson_id BIGINT REFERENCES ems.lessons(id),
    assignment_id BIGINT REFERENCES ems.assignments(id),
    live_class_id BIGINT REFERENCES ems.live_classes(id),
    
    duration_minutes INTEGER,
    ip_address VARCHAR(45),
    device_info TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 27. TUTOR PERFORMANCE
CREATE TABLE ems.tutor_performance (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
    tutor_id BIGINT NOT NULL REFERENCES core.employees(id),
    
    total_courses INTEGER DEFAULT 0,
    total_students INTEGER DEFAULT 0,
    average_student_rating NUMERIC(3,2),
    
    total_assignments_created INTEGER DEFAULT 0,
    average_grading_time_hours NUMERIC(5,2),
    
    total_live_classes INTEGER DEFAULT 0,
    average_class_attendance NUMERIC(5,2),
    student_completion_rate NUMERIC(5,2),
    
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 28. STUDENT RATINGS
CREATE TABLE ems.student_ratings (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
    student_id BIGINT NOT NULL REFERENCES ems.students(id) ON DELETE CASCADE,
    course_id BIGINT REFERENCES ems.courses(id),
    tutor_id BIGINT REFERENCES core.employees(id),
    
    rating_type VARCHAR(50),
    rating_value INTEGER,
    review_text TEXT,
    is_anonymous BOOLEAN DEFAULT FALSE,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- PART 11: CERTIFICATES
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- 29. CERTIFICATES
CREATE TABLE ems.certificates (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
    student_id BIGINT NOT NULL REFERENCES ems.students(id) ON DELETE CASCADE,
    enrollment_id BIGINT NOT NULL REFERENCES ems.student_enrollments(id) ON DELETE CASCADE,
    course_id BIGINT NOT NULL REFERENCES ems.courses(id) ON DELETE CASCADE,
    
    certificate_number VARCHAR(100) UNIQUE NOT NULL,
    issue_date DATE DEFAULT CURRENT_DATE,
    completion_date DATE,
    
    final_grade VARCHAR(10),
    final_percentage NUMERIC(5,2),
    certificate_url TEXT,
    verification_code VARCHAR(100),
    
    issued_by BIGINT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- PART 12: TUTOR DASHBOARD TABLES
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- 30. TUTOR PENDING TASKS
CREATE TABLE ems.tutor_pending_tasks (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
    tutor_id BIGINT NOT NULL REFERENCES core.employees(id),
    
    task_type VARCHAR(50),
    task_priority VARCHAR(20) DEFAULT 'MEDIUM',
    task_title VARCHAR(255),
    task_description TEXT,
    
    reference_type VARCHAR(50),
    reference_id BIGINT,
    due_date TIMESTAMPTZ,
    
    is_completed BOOLEAN DEFAULT FALSE,
    completed_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 31. STUDENT QUERIES
CREATE TABLE ems.student_queries (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
    student_id BIGINT NOT NULL REFERENCES ems.students(id) ON DELETE CASCADE,
    course_id BIGINT REFERENCES ems.courses(id),
    lesson_id BIGINT REFERENCES ems.lessons(id),
    tutor_id BIGINT REFERENCES core.employees(id),
    
    query_subject VARCHAR(255),
    query_text TEXT,
    query_type VARCHAR(50),
    priority VARCHAR(20) DEFAULT 'MEDIUM',
    
    status VARCHAR(50) DEFAULT 'OPEN',
    tutor_response TEXT,
    responded_at TIMESTAMPTZ,
    response_rating INTEGER,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 32. TUTOR SCHEDULE
CREATE TABLE ems.tutor_schedule (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
    tutor_id BIGINT NOT NULL REFERENCES core.employees(id),
    
    schedule_type VARCHAR(50),
    event_title VARCHAR(255),
    event_description TEXT,
    
    course_id BIGINT REFERENCES ems.courses(id),
    live_class_id BIGINT REFERENCES ems.live_classes(id),
    
    event_date DATE NOT NULL,
    start_time TIME,
    end_time TIME,
    location VARCHAR(255),
    
    reminder_sent BOOLEAN DEFAULT FALSE,
    is_recurring BOOLEAN DEFAULT FALSE,
    recurrence_pattern VARCHAR(50),
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- PART 13: ADVANCED ATTENDANCE CONTROL (OPEN/CLOSE WINDOW)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- 33. ATTENDANCE SESSIONS
CREATE TABLE ems.attendance_sessions (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
    course_id BIGINT REFERENCES ems.courses(id) ON DELETE CASCADE,
    live_class_id BIGINT REFERENCES ems.live_classes(id) ON DELETE CASCADE,
    batch_id BIGINT REFERENCES ems.batches(id) ON DELETE CASCADE,
    
    session_date DATE DEFAULT CURRENT_DATE,
    session_type VARCHAR(50) DEFAULT 'LECTURE', -- LECTURE, LAB, TUTORIAL, EXAM
    
    session_opened_by BIGINT, -- Link to app_auth.users or core.employees
    session_opened_at TIMESTAMPTZ DEFAULT NOW(),
    session_closed_at TIMESTAMPTZ,
    
    -- Check-out Window Logic (e.g., last 5 mins)
    is_checkout_active BOOLEAN DEFAULT FALSE,
    checkout_opened_at TIMESTAMPTZ,
    
    status VARCHAR(50) DEFAULT 'OPEN', -- OPEN, CLOSED, EXPIRED
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 34. UNIFIED ATTENDANCE RECORDS (For Students & Tutors)
CREATE TABLE ems.attendance_records (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
    session_id BIGINT NOT NULL REFERENCES ems.attendance_sessions(id) ON DELETE CASCADE,
    
    user_id BIGINT REFERENCES app_auth.users(id),
    student_id BIGINT REFERENCES ems.students(id) ON DELETE CASCADE,
    user_type VARCHAR(50), -- STUDENT, TUTOR, STAFF
    
    check_in_time TIMESTAMPTZ DEFAULT NOW(),
    check_out_time TIMESTAMPTZ,
    
    location_lat DECIMAL(10, 8),
    location_long DECIMAL(11, 8),
    ip_address INET,
    
    status VARCHAR(50), -- PRESENT, LATE, EARLY_LEAVE, ABSENT
    duration_minutes INTEGER,
    
    is_verified BOOLEAN DEFAULT FALSE,
    verified_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- PART 14: SPECIALIST TUTOR DASHBOARD TABLES
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- 35. ASSIGNMENT GRADING QUEUE
CREATE TABLE ems.assignment_grading_queue (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
    tutor_id BIGINT NOT NULL REFERENCES core.employees(id),
    submission_id BIGINT NOT NULL REFERENCES ems.assignment_submissions(id) ON DELETE CASCADE,
    
    priority_score INTEGER DEFAULT 0, -- Higher score = Needs faster grading
    is_re_grading BOOLEAN DEFAULT FALSE,
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    
    status VARCHAR(50) DEFAULT 'PENDING', -- PENDING, IN_PROGRESS, GRADED
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 36. TUTOR EARNINGS (Revenue & Payouts)
CREATE TABLE ems.tutor_earnings (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
    tutor_id BIGINT NOT NULL REFERENCES core.employees(id),
    course_id BIGINT REFERENCES ems.courses(id),
    
    earning_type VARCHAR(50), -- COURSE_COMMISSION, PER_CLASS, BONUS
    amount NUMERIC(12, 2) NOT NULL,
    payout_status VARCHAR(50) DEFAULT 'UNPAID', -- UNPAID, PROCESSED, PAID
    payout_date DATE,
    
    transaction_ref VARCHAR(255),
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 37. BULK OPERATIONS LOG
CREATE TABLE ems.bulk_operations_log (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
    performed_by BIGINT REFERENCES app_auth.users(id),
    
    operation_type VARCHAR(100), -- BULK_GRADING, BULK_ENROLLMENT, BULK_NOTIFY
    target_table VARCHAR(100),
    records_affected INTEGER DEFAULT 0,
    
    status VARCHAR(50), -- SUCCESS, FAILED, PARTIAL
    error_details TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 38. COURSE COMPLETION TRACKER (Snapshots)
CREATE TABLE ems.course_completion_tracker (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
    course_id BIGINT NOT NULL REFERENCES ems.courses(id) ON DELETE CASCADE,
    
    total_students INTEGER DEFAULT 0,
    completed_students INTEGER DEFAULT 0,
    ongoing_students INTEGER DEFAULT 0,
    at_risk_students INTEGER DEFAULT 0,
    
    average_progress_percentage NUMERIC(5, 2),
    
    last_updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 39. TUTOR DASHBOARD WIDGETS (Preferences)
CREATE TABLE ems.tutor_dashboard_widgets (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
    tutor_id BIGINT NOT NULL REFERENCES core.employees(id),
    
    widget_key VARCHAR(100) NOT NULL, -- e.g., 'pending_grading', 'class_schedule'
    is_visible BOOLEAN DEFAULT TRUE,
    sort_order INTEGER DEFAULT 0,
    config JSONB, -- Custom dashboard settings
    
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 40. COURSE STUDENTS SUMMARY (Denormalized for Performance)
CREATE TABLE ems.course_students_summary (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT NOT NULL REFERENCES core.companies(id) ON DELETE CASCADE,
    student_id BIGINT NOT NULL REFERENCES ems.students(id) ON DELETE CASCADE,
    course_id BIGINT NOT NULL REFERENCES ems.courses(id) ON DELETE CASCADE,
    enrollment_id BIGINT NOT NULL REFERENCES ems.student_enrollments(id) ON DELETE CASCADE,
    
    overall_attendance_percentage NUMERIC(5, 2) DEFAULT 0,
    current_average_grade VARCHAR(10),
    total_assignments_submitted INTEGER DEFAULT 0,
    last_activity_at TIMESTAMPTZ,
    
    is_at_risk BOOLEAN DEFAULT FALSE,
    risk_reason TEXT,
    
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(enrollment_id)
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- INDEXES (PERFORMANCE OPTIMIZATION)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE INDEX idx_ems_students_company ON ems.students(company_id);
CREATE INDEX idx_ems_students_branch ON ems.students(branch_id);
CREATE INDEX idx_ems_students_user ON ems.students(user_id);
CREATE INDEX idx_ems_students_code ON ems.students(student_code);

CREATE INDEX idx_ems_courses_company ON ems.courses(company_id);
CREATE INDEX idx_ems_courses_tutor ON ems.courses(tutor_id);
CREATE INDEX idx_ems_courses_status ON ems.courses(status);

CREATE INDEX idx_ems_enrollments_company ON ems.student_enrollments(company_id);
CREATE INDEX idx_ems_enrollments_student ON ems.student_enrollments(student_id);
CREATE INDEX idx_ems_enrollments_course ON ems.student_enrollments(course_id);
CREATE INDEX idx_ems_enrollments_batch ON ems.student_enrollments(batch_id);

CREATE INDEX idx_ems_lessons_course ON ems.lessons(course_id);
CREATE INDEX idx_ems_lessons_module ON ems.lessons(module_id);

CREATE INDEX idx_ems_live_classes_course ON ems.live_classes(course_id);
CREATE INDEX idx_ems_live_classes_tutor ON ems.live_classes(tutor_id);
CREATE INDEX idx_ems_live_classes_date ON ems.live_classes(scheduled_date);

CREATE INDEX idx_ems_assignments_course ON ems.assignments(course_id);
CREATE INDEX idx_ems_submissions_assignment ON ems.assignment_submissions(assignment_id);
CREATE INDEX idx_ems_submissions_student ON ems.assignment_submissions(student_id);

CREATE INDEX idx_ems_notifications_user ON ems.notifications(user_id);
CREATE INDEX idx_ems_notifications_student ON ems.notifications(student_id);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- TRIGGERS (AUTO-UPDATE TIMESTAMPS)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE OR REPLACE FUNCTION ems.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to all tables with updated_at
DO $$
DECLARE
    t text;
BEGIN
    FOR t IN 
        SELECT table_name 
        FROM information_schema.columns 
        WHERE table_schema = 'ems' 
        AND column_name = 'updated_at'
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS update_%I_updated_at ON ems.%I', t, t);
        EXECUTE format('CREATE TRIGGER update_%I_updated_at BEFORE UPDATE ON ems.%I FOR EACH ROW EXECUTE FUNCTION ems.update_updated_at_column()', t, t);
    END LOOP;
END $$;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- SOFT DELETE HELPER FUNCTION
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE OR REPLACE FUNCTION ems.soft_delete(
    p_table_name TEXT,
    p_id BIGINT,
    p_deleted_by BIGINT,
    p_reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
    EXECUTE format(
        'UPDATE ems.%I SET deleted_at = NOW(), deleted_by = $1, delete_reason = $2 WHERE id = $3',
        p_table_name
    ) USING p_deleted_by, p_reason, p_id;
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION ems.soft_delete IS 'Standard soft delete function for EMS tables';

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- VERIFICATION
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DO $$
BEGIN
    RAISE NOTICE '✅ EMS Schema V2 Created Successfully!';
    RAISE NOTICE '📊 Total Tables: 32';
    RAISE NOTICE '🏢 Multi-Tenant: ENABLED (company_id on all tables)';
    RAISE NOTICE '🗑️ Soft Delete: ENABLED';
    RAISE NOTICE '⏰ Auto Timestamps: ENABLED';
END $$;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- END OF EMS SCHEMA V2
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

