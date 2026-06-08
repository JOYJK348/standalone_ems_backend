-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- EMS ADMIN USER SETUP (BRANCH ADMIN WITH LMS ACCESS)
-- Purpose: Create a Branch Admin user with full EMS/LMS module access
-- Company: Durkkas Institute of Professional Learning (DIPL)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- Step 1: Ensure DIPL company exists
INSERT INTO core.companies (name, legal_name, code, email, phone, subscription_plan, subscription_start_date, subscription_end_date, enabled_modules, is_active)
SELECT 
    'Durkkas Institute of Professional Learning', 
    'DIPL Pvt Ltd', 
    'DIPL', 
    'admin@dipl.edu', 
    '+91-9876543210', 
    'ENTERPRISE', 
    CURRENT_DATE, 
    CURRENT_DATE + INTERVAL '1 year', 
    '["LMS", "HR", "ATTENDANCE", "FINANCE", "CRM"]'::jsonb,
    TRUE
WHERE NOT EXISTS (SELECT 1 FROM core.companies WHERE code = 'DIPL');

-- Update modules if company exists
UPDATE core.companies 
SET enabled_modules = '["LMS", "HR", "ATTENDANCE", "FINANCE", "CRM"]'::jsonb,
    subscription_plan = 'ENTERPRISE'
WHERE code = 'DIPL';

-- Step 2: Ensure DIPL Main Campus branch exists
INSERT INTO core.branches (company_id, name, code, branch_type, email, phone, is_active)
SELECT 
    (SELECT id FROM core.companies WHERE code = 'DIPL'), 
    'DIPL Main Campus', 
    'DIPL-MAIN', 
    'HQ', 
    'campus@dipl.edu', 
    '+91-9876543211', 
    TRUE
WHERE NOT EXISTS (
    SELECT 1 FROM core.branches 
    WHERE code = 'DIPL-MAIN' AND company_id = (SELECT id FROM core.companies WHERE code = 'DIPL')
);

-- Step 3: Create EMS Admin user account
-- Email: ems.admin@dipl.edu
-- Password: admin@123 (hashed with bcrypt)
INSERT INTO app_auth.users (email, password_hash, first_name, last_name, display_name, is_active, is_verified)
SELECT 
    'ems.admin@dipl.edu', 
    '$2a$10$fiZI43Ofjx1KwWX/lAWdl.lTC0vtoa6GgaKm2hJmlaFHhnChSgVNS', 
    'EMS', 
    'Administrator', 
    'EMS Admin', 
    TRUE, 
    TRUE
WHERE NOT EXISTS (SELECT 1 FROM app_auth.users WHERE email = 'ems.admin@dipl.edu');

-- Ensure password and active status
UPDATE app_auth.users 
SET password_hash = '$2a$10$fiZI43Ofjx1KwWX/lAWdl.lTC0vtoa6GgaKm2hJmlaFHhnChSgVNS',
    is_active = TRUE,
    is_verified = TRUE,
    display_name = 'EMS Admin'
WHERE email = 'ems.admin@dipl.edu';

-- Step 4: Create employee record for EMS Admin
INSERT INTO core.employees (
    company_id, 
    branch_id, 
    employee_code, 
    first_name, 
    last_name, 
    email, 
    phone, 
    is_active
)
SELECT 
    (SELECT id FROM core.companies WHERE code = 'DIPL'),
    (SELECT id FROM core.branches WHERE code = 'DIPL-MAIN' AND company_id = (SELECT id FROM core.companies WHERE code = 'DIPL')),
    'DIPL-EMS-001',
    'EMS',
    'Administrator',
    'ems.admin@dipl.edu',
    '+91-9988776655',
    TRUE
WHERE NOT EXISTS (
    SELECT 1 FROM core.employees 
    WHERE employee_code = 'DIPL-EMS-001' 
      AND company_id = (SELECT id FROM core.companies WHERE code = 'DIPL')
);

-- Step 5: Assign BRANCH_ADMIN role to EMS Admin (scoped to DIPL)
INSERT INTO app_auth.user_roles (user_id, role_id, company_id, branch_id, is_active)
SELECT 
    u.id, 
    r.id, 
    c.id, 
    b.id, 
    TRUE
FROM app_auth.users u
CROSS JOIN app_auth.roles r
CROSS JOIN core.companies c
LEFT JOIN core.branches b ON b.company_id = c.id AND b.code = 'DIPL-MAIN'
WHERE u.email = 'ems.admin@dipl.edu'
  AND r.name = 'BRANCH_ADMIN'
  AND c.code = 'DIPL'
  AND NOT EXISTS (
      SELECT 1 FROM app_auth.user_roles ur 
      WHERE ur.user_id = u.id 
        AND ur.role_id = r.id 
        AND ur.company_id = c.id
  );

-- Step 6: Create sample courses for EMS Admin to manage
INSERT INTO ems.courses (
    company_id, 
    branch_id, 
    course_code, 
    course_name, 
    course_description, 
    course_category, 
    course_level, 
    course_type, 
    duration_hours, 
    total_lessons, 
    price, 
    is_published, 
    status, 
    is_active
)
SELECT * FROM (VALUES
    (
        (SELECT id FROM core.companies WHERE code = 'DIPL'),
        (SELECT id FROM core.branches WHERE code = 'DIPL-MAIN' AND company_id = (SELECT id FROM core.companies WHERE code = 'DIPL')),
        'WEB101', 
        'Full Stack Web Development', 
        'Master modern web development with React, Node.js, Express, and PostgreSQL. Build production-ready applications.', 
        'Technology', 
        'Beginner', 
        'ONLINE', 
        120, 
        48, 
        15000, 
        TRUE, 
        'PUBLISHED', 
        TRUE
    ),
    (
        (SELECT id FROM core.companies WHERE code = 'DIPL'),
        (SELECT id FROM core.branches WHERE code = 'DIPL-MAIN' AND company_id = (SELECT id FROM core.companies WHERE code = 'DIPL')),
        'DATA201', 
        'Data Science & Machine Learning', 
        'Learn Python, Pandas, NumPy, Scikit-learn, and TensorFlow. Build ML models from scratch.', 
        'Technology', 
        'Intermediate', 
        'HYBRID', 
        150, 
        60, 
        25000, 
        TRUE, 
        'PUBLISHED', 
        TRUE
    ),
    (
        (SELECT id FROM core.companies WHERE code = 'DIPL'),
        (SELECT id FROM core.branches WHERE code = 'DIPL-MAIN' AND company_id = (SELECT id FROM core.companies WHERE code = 'DIPL')),
        'MOBILE301', 
        'Mobile App Development', 
        'Build native mobile apps with React Native. Deploy to iOS and Android app stores.', 
        'Technology', 
        'Advanced', 
        'ONLINE', 
        100, 
        40, 
        20000, 
        TRUE, 
        'PUBLISHED', 
        TRUE
    )
) AS v(company_id, branch_id, course_code, course_name, course_description, course_category, course_level, course_type, duration_hours, total_lessons, price, is_published, status, is_active)
WHERE NOT EXISTS (
    SELECT 1 FROM ems.courses 
    WHERE course_code = v.course_code 
      AND company_id = (SELECT id FROM core.companies WHERE code = 'DIPL')
);

-- Step 7: Create sample batches
INSERT INTO ems.batches (
    company_id,
    branch_id,
    course_id,
    batch_code,
    batch_name,
    start_date,
    end_date,
    max_students,
    current_strength,
    status,
    is_active
)
SELECT 
    (SELECT id FROM core.companies WHERE code = 'DIPL'),
    (SELECT id FROM core.branches WHERE code = 'DIPL-MAIN' AND company_id = (SELECT id FROM core.companies WHERE code = 'DIPL')),
    c.id,
    CONCAT(c.course_code, '-B1'),
    CONCAT(c.course_name, ' - Batch 1'),
    CURRENT_DATE,
    CURRENT_DATE + INTERVAL '4 months',
    30,
    22,
    'ACTIVE',
    TRUE
FROM ems.courses c
WHERE c.company_id = (SELECT id FROM core.companies WHERE code = 'DIPL')
  AND c.course_code IN ('WEB101', 'DATA201')
  AND NOT EXISTS (
      SELECT 1 FROM ems.batches b
      WHERE b.batch_code = CONCAT(c.course_code, '-B1')
        AND b.company_id = (SELECT id FROM core.companies WHERE code = 'DIPL')
  );

-- Step 8: Create sample students
INSERT INTO ems.students (
    company_id, 
    branch_id, 
    student_code, 
    first_name, 
    middle_name, 
    last_name, 
    date_of_birth, 
    gender, 
    email, 
    phone, 
    address_line1, 
    city, 
    state, 
    country, 
    postal_code, 
    status, 
    is_active
)
SELECT * FROM (VALUES
    (
        (SELECT id FROM core.companies WHERE code = 'DIPL'),
        (SELECT id FROM core.branches WHERE code = 'DIPL-MAIN' AND company_id = (SELECT id FROM core.companies WHERE code = 'DIPL')),
        'DIPL2026001', 'Rajesh', 'Kumar', 'Sharma', '2005-06-15'::DATE, 'Male', 
        'rajesh.sharma@student.dipl.edu', '+91-9123456789', 
        '123, MG Road', 'Chennai', 'Tamil Nadu', 'India', '600001', 'ACTIVE', TRUE
    ),
    (
        (SELECT id FROM core.companies WHERE code = 'DIPL'),
        (SELECT id FROM core.branches WHERE code = 'DIPL-MAIN' AND company_id = (SELECT id FROM core.companies WHERE code = 'DIPL')),
        'DIPL2026002', 'Priya', NULL, 'Patel', '2004-08-22'::DATE, 'Female', 
        'priya.patel@student.dipl.edu', '+91-9234567890', 
        '456, Park Street', 'Mumbai', 'Maharashtra', 'India', '400001', 'ACTIVE', TRUE
    ),
    (
        (SELECT id FROM core.companies WHERE code = 'DIPL'),
        (SELECT id FROM core.branches WHERE code = 'DIPL-MAIN' AND company_id = (SELECT id FROM core.companies WHERE code = 'DIPL')),
        'DIPL2026003', 'Arjun', NULL, 'Reddy', '2005-03-10'::DATE, 'Male', 
        'arjun.reddy@student.dipl.edu', '+91-9345678901', 
        '789, Brigade Road', 'Bangalore', 'Karnataka', 'India', '560001', 'ACTIVE', TRUE
    )
) AS v(company_id, branch_id, student_code, first_name, middle_name, last_name, date_of_birth, gender, email, phone, address_line1, city, state, country, postal_code, status, is_active)
WHERE NOT EXISTS (
    SELECT 1 FROM ems.students 
    WHERE student_code = v.student_code 
      AND company_id = (SELECT id FROM core.companies WHERE code = 'DIPL')
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- VERIFICATION
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DO $$
BEGIN
    RAISE NOTICE '✅ EMS Admin Setup Complete!';
    RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
    RAISE NOTICE '🏢 Company: DIPL (Durkkas Institute of Professional Learning)';
    RAISE NOTICE '🏫 Branch: DIPL Main Campus';
    RAISE NOTICE '👤 EMS Admin: EMS Administrator';
    RAISE NOTICE '📧 Email: ems.admin@dipl.edu';
    RAISE NOTICE '🔑 Password: admin@123';
    RAISE NOTICE '👥 Role: BRANCH_ADMIN (Level 1)';
    RAISE NOTICE '📦 Modules: LMS, HR, ATTENDANCE';
    RAISE NOTICE '📚 Sample Courses: 3 courses created';
    RAISE NOTICE '👨‍🎓 Sample Students: 3 students created';
    RAISE NOTICE '📊 Sample Batches: 2 batches created';
    RAISE NOTICE '🌐 Login URL: http://localhost:3001/login';
    RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
END $$;
