-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- COMPLETE EMS DUMMY DATA FOR MANUAL TESTING
-- Company: Dare Academy (Auto-detected)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- Auto-detect Dare Academy company_id and branch_id
DO $$
DECLARE
    v_company_id BIGINT;
    v_branch_id BIGINT;
BEGIN
    -- Get Dare Academy company_id
    SELECT id INTO v_company_id 
    FROM core.companies 
    WHERE company_name LIKE '%Dare%Academy%' 
    LIMIT 1;
    
    IF v_company_id IS NULL THEN
        RAISE EXCEPTION 'Dare Academy company not found! Please check core.companies table.';
    END IF;
    
    -- Get first branch of Dare Academy
    SELECT id INTO v_branch_id 
    FROM core.branches 
    WHERE company_id = v_company_id 
    LIMIT 1;
    
    IF v_branch_id IS NULL THEN
        RAISE EXCEPTION 'No branch found for Dare Academy! Please check core.branches table.';
    END IF;
    
    RAISE NOTICE 'Using Company ID: %, Branch ID: %', v_company_id, v_branch_id;
    
    -- Store in temp table for use in subsequent queries
    CREATE TEMP TABLE IF NOT EXISTS temp_company_info (
        company_id BIGINT,
        branch_id BIGINT
    );
    
    DELETE FROM temp_company_info;
    INSERT INTO temp_company_info VALUES (v_company_id, v_branch_id);
END $$;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 1. COURSES (5 Realistic Courses)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

INSERT INTO ems.courses (
    company_id, branch_id, course_code, course_name, course_description, 
    duration_hours, status, is_published, course_category, course_level, 
    total_lessons, created_at
)
SELECT 
    t.company_id, t.branch_id, course_code, course_name, course_description,
    duration_hours, status, is_published, course_category, course_level,
    total_lessons, created_at
FROM temp_company_info t,
(VALUES
    -- Course 1: Full Stack Development
    ('FS-2026-01', 'Full Stack Web Development Bootcamp', 
    'Master modern web development with React, Node.js, and PostgreSQL. Build real-world projects and deploy to production.',
    640, 'PUBLISHED', true, 'Programming', 'INTERMEDIATE', 64, NOW()),

    -- Course 2: Data Science
    ('DS-2026-01', 'Data Science & Machine Learning', 
    'Learn Python, Pandas, NumPy, Scikit-learn, and TensorFlow. Work on real datasets and build ML models.',
    800, 'PUBLISHED', true, 'Data Science', 'ADVANCED', 80, NOW()),

    -- Course 3: Digital Marketing
    ('DM-2026-01', 'Digital Marketing Masterclass', 
    'Complete digital marketing course covering SEO, SEM, Social Media Marketing, Email Marketing, and Analytics.',
    480, 'PUBLISHED', true, 'Marketing', 'BEGINNER', 48, NOW()),

    -- Course 4: Mobile App Development
    ('MA-2026-01', 'React Native Mobile App Development', 
    'Build cross-platform mobile apps for iOS and Android using React Native and Expo.',
    560, 'PUBLISHED', true, 'Programming', 'INTERMEDIATE', 56, NOW()),

    -- Course 5: UI/UX Design
    ('UX-2026-01', 'UI/UX Design Fundamentals', 
    'Learn user research, wireframing, prototyping, and design systems using Figma and Adobe XD.',
    400, 'DRAFT', false, 'Design', 'BEGINNER', 40, NOW())
) AS v(course_code, course_name, course_description, duration_hours, status, is_published, course_category, course_level, total_lessons, created_at);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 2. BATCHES (6 Batches with Different Schedules)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

INSERT INTO ems.batches (
    company_id, branch_id, batch_code, batch_name, course_id,
    start_date, end_date, max_students, current_strength, status, created_at
)
SELECT 
    t.company_id, t.branch_id, batch_code, batch_name, 
    (SELECT id FROM ems.courses WHERE course_code = course_code_ref),
    start_date, end_date, max_students, current_strength, status, created_at
FROM temp_company_info t,
(VALUES
    -- Batch 1: Full Stack - Morning
    ('FS-MORN-FEB26', 'Full Stack Morning Batch', 'FS-2026-01', '2026-02-10'::DATE, '2026-06-10'::DATE, 30, 0, 'ACTIVE', NOW()),
    
    -- Batch 2: Full Stack - Evening
    ('FS-EVE-FEB26', 'Full Stack Evening Batch', 'FS-2026-01', '2026-02-15'::DATE, '2026-06-15'::DATE, 30, 0, 'ACTIVE', NOW()),
    
    -- Batch 3: Data Science - Weekend
    ('DS-WKND-FEB26', 'Data Science Weekend Batch', 'DS-2026-01', '2026-02-08'::DATE, '2026-07-08'::DATE, 25, 0, 'ACTIVE', NOW()),
    
    -- Batch 4: Digital Marketing - Fast Track
    ('DM-FAST-FEB26', 'Digital Marketing Fast Track', 'DM-2026-01', '2026-02-12'::DATE, '2026-05-12'::DATE, 40, 0, 'ACTIVE', NOW()),
    
    -- Batch 5: Mobile App - Morning
    ('MA-MORN-MAR26', 'Mobile App Morning Batch', 'MA-2026-01', '2026-03-01'::DATE, '2026-06-15'::DATE, 25, 0, 'ACTIVE', NOW()),
    
    -- Batch 6: UI/UX - Evening (Starting Soon)
    ('UX-EVE-MAR26', 'UI/UX Evening Batch', 'UX-2026-01', '2026-03-10'::DATE, '2026-05-20'::DATE, 20, 0, 'ACTIVE', NOW())
) AS v(batch_code, batch_name, course_code_ref, start_date, end_date, max_students, current_strength, status, created_at);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3. STUDENTS (20 Students with Realistic Data)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

INSERT INTO ems.students (
    company_id, branch_id, student_code, first_name, last_name, 
    email, phone, gender, date_of_birth, status, created_at
) VALUES
(1, 1, 'STU-2026-001', 'Rajesh', 'Kumar', 'rajesh.kumar@gmail.com', '+91 9876543210', 'MALE', '2000-05-15', 'ACTIVE', NOW()),
(1, 1, 'STU-2026-002', 'Priya', 'Sharma', 'priya.sharma@gmail.com', '+91 9876543211', 'FEMALE', '2001-08-22', 'ACTIVE', NOW()),
(1, 1, 'STU-2026-003', 'Amit', 'Patel', 'amit.patel@gmail.com', '+91 9876543212', 'MALE', '1999-12-10', 'ACTIVE', NOW()),
(1, 1, 'STU-2026-004', 'Sneha', 'Reddy', 'sneha.reddy@gmail.com', '+91 9876543213', 'FEMALE', '2002-03-18', 'ACTIVE', NOW()),
(1, 1, 'STU-2026-005', 'Vikram', 'Singh', 'vikram.singh@gmail.com', '+91 9876543214', 'MALE', '2000-11-25', 'ACTIVE', NOW()),
(1, 1, 'STU-2026-006', 'Ananya', 'Iyer', 'ananya.iyer@gmail.com', '+91 9876543215', 'FEMALE', '2001-06-30', 'ACTIVE', NOW()),
(1, 1, 'STU-2026-007', 'Karthik', 'Menon', 'karthik.menon@gmail.com', '+91 9876543216', 'MALE', '1998-09-14', 'ACTIVE', NOW()),
(1, 1, 'STU-2026-008', 'Divya', 'Nair', 'divya.nair@gmail.com', '+91 9876543217', 'FEMALE', '2002-01-20', 'ACTIVE', NOW()),
(1, 1, 'STU-2026-009', 'Arjun', 'Desai', 'arjun.desai@gmail.com', '+91 9876543218', 'MALE', '2000-07-08', 'ACTIVE', NOW()),
(1, 1, 'STU-2026-010', 'Meera', 'Joshi', 'meera.joshi@gmail.com', '+91 9876543219', 'FEMALE', '2001-04-12', 'ACTIVE', NOW()),
(1, 1, 'STU-2026-011', 'Rahul', 'Verma', 'rahul.verma@gmail.com', '+91 9876543220', 'MALE', '1999-10-05', 'ACTIVE', NOW()),
(1, 1, 'STU-2026-012', 'Pooja', 'Gupta', 'pooja.gupta@gmail.com', '+91 9876543221', 'FEMALE', '2002-02-28', 'ACTIVE', NOW()),
(1, 1, 'STU-2026-013', 'Sanjay', 'Rao', 'sanjay.rao@gmail.com', '+91 9876543222', 'MALE', '2000-08-16', 'ACTIVE', NOW()),
(1, 1, 'STU-2026-014', 'Kavya', 'Pillai', 'kavya.pillai@gmail.com', '+91 9876543223', 'FEMALE', '2001-12-03', 'ACTIVE', NOW()),
(1, 1, 'STU-2026-015', 'Aditya', 'Chopra', 'aditya.chopra@gmail.com', '+91 9876543224', 'MALE', '1999-05-21', 'ACTIVE', NOW()),
(1, 1, 'STU-2026-016', 'Nisha', 'Kapoor', 'nisha.kapoor@gmail.com', '+91 9876543225', 'FEMALE', '2002-09-07', 'ACTIVE', NOW()),
(1, 1, 'STU-2026-017', 'Rohan', 'Malhotra', 'rohan.malhotra@gmail.com', '+91 9876543226', 'MALE', '2000-03-14', 'ACTIVE', NOW()),
(1, 1, 'STU-2026-018', 'Shreya', 'Bansal', 'shreya.bansal@gmail.com', '+91 9876543227', 'FEMALE', '2001-11-19', 'ACTIVE', NOW()),
(1, 1, 'STU-2026-019', 'Varun', 'Agarwal', 'varun.agarwal@gmail.com', '+91 9876543228', 'MALE', '1999-07-26', 'ACTIVE', NOW()),
(1, 1, 'STU-2026-020', 'Tanvi', 'Shah', 'tanvi.shah@gmail.com', '+91 9876543229', 'FEMALE', '2002-04-09', 'ACTIVE', NOW());

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 4. ENROLLMENTS (Assign Students to Courses & Batches)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- Full Stack Morning Batch (8 students)
INSERT INTO ems.student_enrollments (
    company_id, branch_id, student_id, course_id, batch_id,
    enrollment_date, enrollment_status, payment_status, created_at
)
SELECT 
    1, 1, s.id,
    (SELECT id FROM ems.courses WHERE course_code = 'FS-2026-01'),
    (SELECT id FROM ems.batches WHERE batch_code = 'FS-MORN-FEB26'),
    '2026-02-01', 'ACTIVE', 'PAID', NOW()
FROM ems.students s
WHERE s.student_code IN ('STU-2026-001', 'STU-2026-002', 'STU-2026-003', 'STU-2026-004', 'STU-2026-005', 'STU-2026-006', 'STU-2026-007', 'STU-2026-008');

-- Full Stack Evening Batch (6 students)
INSERT INTO ems.student_enrollments (
    company_id, branch_id, student_id, course_id, batch_id,
    enrollment_date, enrollment_status, payment_status, created_at
)
SELECT 
    1, 1, s.id,
    (SELECT id FROM ems.courses WHERE course_code = 'FS-2026-01'),
    (SELECT id FROM ems.batches WHERE batch_code = 'FS-EVE-FEB26'),
    '2026-02-05', 'ACTIVE', 'PAID', NOW()
FROM ems.students s
WHERE s.student_code IN ('STU-2026-009', 'STU-2026-010', 'STU-2026-011', 'STU-2026-012', 'STU-2026-013', 'STU-2026-014');

-- Data Science Weekend Batch (4 students)
INSERT INTO ems.student_enrollments (
    company_id, branch_id, student_id, course_id, batch_id,
    enrollment_date, enrollment_status, payment_status, created_at
)
SELECT 
    1, 1, s.id,
    (SELECT id FROM ems.courses WHERE course_code = 'DS-2026-01'),
    (SELECT id FROM ems.batches WHERE batch_code = 'DS-WKND-FEB26'),
    '2026-02-03', 'ACTIVE', 'PARTIAL', NOW()
FROM ems.students s
WHERE s.student_code IN ('STU-2026-015', 'STU-2026-016', 'STU-2026-017', 'STU-2026-018');

-- Digital Marketing Fast Track (2 students)
INSERT INTO ems.student_enrollments (
    company_id, branch_id, student_id, course_id, batch_id,
    enrollment_date, enrollment_status, payment_status, created_at
)
SELECT 
    1, 1, s.id,
    (SELECT id FROM ems.courses WHERE course_code = 'DM-2026-01'),
    (SELECT id FROM ems.batches WHERE batch_code = 'DM-FAST-FEB26'),
    '2026-02-07', 'ACTIVE', 'PAID', NOW()
FROM ems.students s
WHERE s.student_code IN ('STU-2026-019', 'STU-2026-020');

-- Update batch current_strength
UPDATE ems.batches SET current_strength = 8 WHERE batch_code = 'FS-MORN-FEB26';
UPDATE ems.batches SET current_strength = 6 WHERE batch_code = 'FS-EVE-FEB26';
UPDATE ems.batches SET current_strength = 4 WHERE batch_code = 'DS-WKND-FEB26';
UPDATE ems.batches SET current_strength = 2 WHERE batch_code = 'DM-FAST-FEB26';

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 5. ASSIGNMENTS (10 Assignments across courses)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

INSERT INTO ems.assignments (
    company_id, course_id, assignment_title, assignment_description,
    deadline, max_marks, created_at
) VALUES
-- Full Stack Assignments
(1, (SELECT id FROM ems.courses WHERE course_code = 'FS-2026-01'),
'Build a Todo App with React', 
'Create a fully functional todo application using React hooks and local storage.',
'2026-02-25', 100, NOW()),

(1, (SELECT id FROM ems.courses WHERE course_code = 'FS-2026-01'),
'REST API with Node.js & Express', 
'Build a RESTful API for a blog application with CRUD operations.',
'2026-03-10', 100, NOW()),

(1, (SELECT id FROM ems.courses WHERE course_code = 'FS-2026-01'),
'Database Design & PostgreSQL', 
'Design and implement a database schema for an e-commerce platform.',
'2026-03-25', 100, NOW()),

-- Data Science Assignments
(1, (SELECT id FROM ems.courses WHERE course_code = 'DS-2026-01'),
'Data Cleaning with Pandas', 
'Clean and prepare a messy dataset using Pandas. Handle missing values and outliers.',
'2026-02-28', 100, NOW()),

(1, (SELECT id FROM ems.courses WHERE course_code = 'DS-2026-01'),
'Linear Regression Model', 
'Build a linear regression model to predict house prices using scikit-learn.',
'2026-03-15', 100, NOW()),

(1, (SELECT id FROM ems.courses WHERE course_code = 'DS-2026-01'),
'Image Classification with CNN', 
'Create a convolutional neural network to classify images from CIFAR-10 dataset.',
'2026-04-05', 100, NOW()),

-- Digital Marketing Assignments
(1, (SELECT id FROM ems.courses WHERE course_code = 'DM-2026-01'),
'SEO Audit Report', 
'Perform a complete SEO audit of a website and provide recommendations.',
'2026-03-01', 100, NOW()),

(1, (SELECT id FROM ems.courses WHERE course_code = 'DM-2026-01'),
'Social Media Campaign Plan', 
'Create a 30-day social media marketing campaign for a product launch.',
'2026-03-20', 100, NOW()),

-- Mobile App Assignments
(1, (SELECT id FROM ems.courses WHERE course_code = 'MA-2026-01'),
'Weather App with React Native', 
'Build a weather app that fetches data from OpenWeather API.',
'2026-03-20', 100, NOW()),

(1, (SELECT id FROM ems.courses WHERE course_code = 'MA-2026-01'),
'E-commerce App UI', 
'Design and implement the UI for a mobile e-commerce application.',
'2026-04-10', 100, NOW());

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 6. QUIZZES (8 Quizzes with Questions)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

INSERT INTO ems.quizzes (
    company_id, branch_id, course_id, title, description,
    duration_minutes, total_marks, passing_marks, max_attempts, is_published, created_at
) VALUES
-- Full Stack Quizzes
(1, 1, (SELECT id FROM ems.courses WHERE course_code = 'FS-2026-01'),
'React Fundamentals Quiz', 
'Test your knowledge of React basics, components, and hooks.',
30, 50, 25, 2, true, NOW()),

(1, 1, (SELECT id FROM ems.courses WHERE course_code = 'FS-2026-01'),
'JavaScript ES6+ Quiz', 
'Quiz on modern JavaScript features including arrow functions, promises, and async/await.',
45, 100, 50, 2, true, NOW()),

-- Data Science Quizzes
(1, 1, (SELECT id FROM ems.courses WHERE course_code = 'DS-2026-01'),
'Python Basics Quiz', 
'Test your Python programming fundamentals.',
30, 50, 25, 3, true, NOW()),

(1, 1, (SELECT id FROM ems.courses WHERE course_code = 'DS-2026-01'),
'Machine Learning Concepts', 
'Quiz on supervised learning, unsupervised learning, and model evaluation.',
60, 100, 60, 2, true, NOW()),

-- Digital Marketing Quizzes
(1, 1, (SELECT id FROM ems.courses WHERE course_code = 'DM-2026-01'),
'SEO Fundamentals Quiz', 
'Test your knowledge of on-page and off-page SEO.',
30, 50, 30, 2, true, NOW()),

(1, 1, (SELECT id FROM ems.courses WHERE course_code = 'DM-2026-01'),
'Google Ads Certification Practice', 
'Practice quiz for Google Ads certification.',
45, 100, 70, 3, true, NOW()),

-- Mobile App Quizzes
(1, 1, (SELECT id FROM ems.courses WHERE course_code = 'MA-2026-01'),
'React Native Basics', 
'Quiz on React Native components and navigation.',
30, 50, 25, 2, true, NOW()),

(1, 1, (SELECT id FROM ems.courses WHERE course_code = 'MA-2026-01'),
'Mobile App Design Patterns', 
'Test your knowledge of mobile app architecture and design patterns.',
45, 100, 50, 2, true, NOW());

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 7. LIVE CLASSES (Scheduled Sessions)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

INSERT INTO ems.live_classes (
    company_id, branch_id, course_id, batch_id, title, description,
    scheduled_at, duration_minutes, meeting_link, status, created_at
) VALUES
-- Full Stack Morning Batch Classes
(1, 1, 
(SELECT id FROM ems.courses WHERE course_code = 'FS-2026-01'),
(SELECT id FROM ems.batches WHERE batch_code = 'FS-MORN-FEB26'),
'Introduction to React Hooks',
'Learn useState, useEffect, and custom hooks with practical examples.',
'2026-02-11 09:00:00', 120, 'https://meet.google.com/abc-defg-hij', 'SCHEDULED', NOW()),

(1, 1, 
(SELECT id FROM ems.courses WHERE course_code = 'FS-2026-01'),
(SELECT id FROM ems.batches WHERE batch_code = 'FS-MORN-FEB26'),
'Building REST APIs with Express',
'Create a complete REST API with authentication and validation.',
'2026-02-13 09:00:00', 120, 'https://meet.google.com/abc-defg-klm', 'SCHEDULED', NOW()),

-- Full Stack Evening Batch Classes
(1, 1, 
(SELECT id FROM ems.courses WHERE course_code = 'FS-2026-01'),
(SELECT id FROM ems.batches WHERE batch_code = 'FS-EVE-FEB26'),
'React Component Architecture',
'Learn how to structure React applications with reusable components.',
'2026-02-16 18:00:00', 120, 'https://meet.google.com/xyz-abcd-efg', 'SCHEDULED', NOW()),

-- Data Science Weekend Batch
(1, 1, 
(SELECT id FROM ems.courses WHERE course_code = 'DS-2026-01'),
(SELECT id FROM ems.batches WHERE batch_code = 'DS-WKND-FEB26'),
'Data Visualization with Matplotlib',
'Create stunning visualizations to tell data stories.',
'2026-02-08 10:00:00', 180, 'https://meet.google.com/data-sci-001', 'SCHEDULED', NOW()),

(1, 1, 
(SELECT id FROM ems.courses WHERE course_code = 'DS-2026-01'),
(SELECT id FROM ems.batches WHERE batch_code = 'DS-WKND-FEB26'),
'Introduction to Machine Learning',
'Understand ML concepts, algorithms, and when to use them.',
'2026-02-15 10:00:00', 180, 'https://meet.google.com/data-sci-002', 'SCHEDULED', NOW()),

-- Digital Marketing Fast Track
(1, 1, 
(SELECT id FROM ems.courses WHERE course_code = 'DM-2026-01'),
(SELECT id FROM ems.batches WHERE batch_code = 'DM-FAST-FEB26'),
'SEO Strategy Workshop',
'Learn keyword research, on-page optimization, and link building.',
'2026-02-13 14:00:00', 90, 'https://meet.google.com/dm-seo-001', 'SCHEDULED', NOW()),

(1, 1, 
(SELECT id FROM ems.courses WHERE course_code = 'DM-2026-01'),
(SELECT id FROM ems.batches WHERE batch_code = 'DM-FAST-FEB26'),
'Google Ads Masterclass',
'Create and optimize Google Ads campaigns for maximum ROI.',
'2026-02-20 14:00:00', 90, 'https://meet.google.com/dm-ads-001', 'SCHEDULED', NOW());

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 8. MATERIALS (Course Materials & Resources)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

INSERT INTO ems.materials (
    company_id, branch_id, course_id, title, description,
    material_type, file_url, is_downloadable, created_at
) VALUES
-- Full Stack Materials
(1, 1, (SELECT id FROM ems.courses WHERE course_code = 'FS-2026-01'),
'React Cheat Sheet', 
'Quick reference guide for React hooks and lifecycle methods.',
'PDF', 'https://storage.durkkas.com/materials/react-cheatsheet.pdf', true, NOW()),

(1, 1, (SELECT id FROM ems.courses WHERE course_code = 'FS-2026-01'),
'Node.js Best Practices', 
'Comprehensive guide to Node.js development best practices.',
'PDF', 'https://storage.durkkas.com/materials/nodejs-best-practices.pdf', true, NOW()),

(1, 1, (SELECT id FROM ems.courses WHERE course_code = 'FS-2026-01'),
'Full Stack Project Template', 
'Starter template with React frontend and Node.js backend.',
'ZIP', 'https://storage.durkkas.com/materials/fullstack-template.zip', true, NOW()),

-- Data Science Materials
(1, 1, (SELECT id FROM ems.courses WHERE course_code = 'DS-2026-01'),
'Python for Data Science Handbook', 
'Complete guide to Python libraries for data analysis.',
'PDF', 'https://storage.durkkas.com/materials/python-ds-handbook.pdf', true, NOW()),

(1, 1, (SELECT id FROM ems.courses WHERE course_code = 'DS-2026-01'),
'Machine Learning Algorithms Cheat Sheet', 
'Visual guide to ML algorithms and when to use them.',
'PDF', 'https://storage.durkkas.com/materials/ml-algorithms.pdf', true, NOW()),

(1, 1, (SELECT id FROM ems.courses WHERE course_code = 'DS-2026-01'),
'Sample Datasets Collection', 
'Curated datasets for practice and projects.',
'ZIP', 'https://storage.durkkas.com/materials/datasets.zip', true, NOW()),

-- Digital Marketing Materials
(1, 1, (SELECT id FROM ems.courses WHERE course_code = 'DM-2026-01'),
'SEO Checklist 2026', 
'Complete SEO audit checklist for websites.',
'PDF', 'https://storage.durkkas.com/materials/seo-checklist.pdf', true, NOW()),

(1, 1, (SELECT id FROM ems.courses WHERE course_code = 'DM-2026-01'),
'Social Media Content Calendar Template', 
'Excel template for planning social media posts.',
'XLSX', 'https://storage.durkkas.com/materials/content-calendar.xlsx', true, NOW()),

-- Mobile App Materials
(1, 1, (SELECT id FROM ems.courses WHERE course_code = 'MA-2026-01'),
'React Native Component Library', 
'Reusable components for React Native apps.',
'ZIP', 'https://storage.durkkas.com/materials/rn-components.zip', true, NOW()),

(1, 1, (SELECT id FROM ems.courses WHERE course_code = 'MA-2026-01'),
'Mobile App Design Guidelines', 
'iOS and Android design guidelines and best practices.',
'PDF', 'https://storage.durkkas.com/materials/mobile-design-guide.pdf', true, NOW());

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- VERIFICATION QUERIES
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- Check counts
SELECT 'Courses' as entity, COUNT(*) as count FROM ems.courses WHERE company_id = 1 AND deleted_at IS NULL
UNION ALL
SELECT 'Batches', COUNT(*) FROM ems.batches WHERE company_id = 1 AND deleted_at IS NULL
UNION ALL
SELECT 'Students', COUNT(*) FROM ems.students WHERE company_id = 1 AND deleted_at IS NULL
UNION ALL
SELECT 'Enrollments', COUNT(*) FROM ems.student_enrollments WHERE company_id = 1 AND deleted_at IS NULL
UNION ALL
SELECT 'Assignments', COUNT(*) FROM ems.assignments WHERE company_id = 1 AND deleted_at IS NULL
UNION ALL
SELECT 'Quizzes', COUNT(*) FROM ems.quizzes WHERE company_id = 1 AND deleted_at IS NULL
UNION ALL
SELECT 'Live Classes', COUNT(*) FROM ems.live_classes WHERE company_id = 1 AND deleted_at IS NULL
UNION ALL
SELECT 'Materials', COUNT(*) FROM ems.materials WHERE company_id = 1 AND deleted_at IS NULL;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- SUMMARY
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- ✅ 5 Courses (Full Stack, Data Science, Digital Marketing, Mobile App, UI/UX)
-- ✅ 6 Batches (Different schedules and timings)
-- ✅ 20 Students (Realistic names and data)
-- ✅ 20 Enrollments (Students mapped to courses and batches)
-- ✅ 10 Assignments (Across different courses)
-- ✅ 8 Quizzes (With proper configuration)
-- ✅ 7 Live Classes (Scheduled sessions with meeting links)
-- ✅ 10 Materials (PDFs, ZIPs, XLSX files)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
