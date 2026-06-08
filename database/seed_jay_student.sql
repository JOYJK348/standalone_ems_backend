-- ============================================================================
-- Seed: Jay Student (jay@gmail.com / 123456) with Practice Allocations
-- Creates: user, student profile, enrollment, practice allocations
-- ============================================================================

DO $$
DECLARE
    v_company_id BIGINT;
    v_branch_id BIGINT;
    v_role_id BIGINT;
    v_user_id BIGINT;
    v_student_id BIGINT;
    v_course_id BIGINT;
    v_batch_id BIGINT;
    v_enroll_id BIGINT;
    v_alloc_id BIGINT;
BEGIN
    -- Get DIPL company & branch
    SELECT id INTO v_company_id FROM core.companies WHERE code = 'DIPL';
    SELECT id INTO v_branch_id FROM core.branches WHERE company_id = v_company_id AND code = 'DIPL-MAIN';

    RAISE NOTICE 'Using Company ID: %, Branch ID: %', v_company_id, v_branch_id;

    -- Get STUDENT role
    SELECT id INTO v_role_id FROM app_auth.roles WHERE name = 'STUDENT';

    -- 1. Create auth user
    INSERT INTO app_auth.users (email, password_hash, first_name, last_name, display_name, is_active, is_verified)
    VALUES ('jay@gmail.com', '$2a$10$kwTq9fwQEC4Cy1oe20hubuCxQ69kXhYX0qnDFrZuQOHxnVVFUShCS',
            'Jay', 'Student', 'Jay Student', TRUE, TRUE)
    ON CONFLICT (email) DO UPDATE SET
        password_hash = EXCLUDED.password_hash,
        is_active = TRUE,
        is_verified = TRUE
    RETURNING id INTO v_user_id;

    RAISE NOTICE 'Created user ID: %', v_user_id;

    -- 2. Assign STUDENT role
    DELETE FROM app_auth.user_roles WHERE user_id = v_user_id AND role_id = v_role_id;
    INSERT INTO app_auth.user_roles (user_id, role_id, company_id, branch_id, is_active)
    VALUES (v_user_id, v_role_id, v_company_id, v_branch_id, TRUE);

    -- 3. Create student profile
    INSERT INTO ems.students (company_id, branch_id, user_id, student_code, first_name, last_name, email, phone, status, is_active)
    VALUES (v_company_id, v_branch_id, v_user_id, 'JAY-2026-001',
            'Jay', 'Student', 'jay@gmail.com', '+91-9876543210', 'ACTIVE', TRUE)
    ON CONFLICT (company_id, student_code) DO UPDATE SET user_id = EXCLUDED.user_id, is_active = TRUE
    RETURNING id INTO v_student_id;

    RAISE NOTICE 'Created student ID: %', v_student_id;

    -- 4. Enable practice modules on FS-2026 course
    UPDATE ems.courses SET enabled_practice_modules = ARRAY['GST', 'TDS', 'INCOME_TAX']::TEXT[]
    WHERE company_id = v_company_id AND course_code = 'FS-2026';

    -- 5. Get FS-2026 course and batch
    SELECT id INTO v_course_id FROM ems.courses
    WHERE company_id = v_company_id AND course_code = 'FS-2026';

    SELECT id INTO v_batch_id FROM ems.batches
    WHERE company_id = v_company_id AND batch_code = 'FSD-BATCH-A';

    -- 6. Enroll student in Full Stack course
    INSERT INTO ems.student_enrollments (company_id, student_id, course_id, batch_id, enrollment_date, enrollment_status, payment_status, completion_percentage)
    VALUES (v_company_id, v_student_id, v_course_id, v_batch_id, CURRENT_DATE, 'ACTIVE', 'PAID', 0)
    ON CONFLICT (company_id, student_id, course_id, batch_id) DO UPDATE SET enrollment_status = 'ACTIVE'
    RETURNING id INTO v_enroll_id;

    RAISE NOTICE 'Created enrollment ID: %', v_enroll_id;

    -- 7. Create practice allocations for all 3 modules
    -- GST
    INSERT INTO ems.student_practice_allocations (company_id, student_id, course_id, module_type, usage_limit, used_count, status, allocated_by)
    VALUES (v_company_id, v_student_id, v_course_id, 'GST', 5, 0, 'ACTIVE', v_user_id)
    RETURNING id INTO v_alloc_id;
    RAISE NOTICE 'GST allocation ID: %', v_alloc_id;

    -- Update quota
    UPDATE ems.practice_quotas SET used_licenses = used_licenses + 1
    WHERE company_id = v_company_id AND module_type = 'GST';

    -- TDS
    INSERT INTO ems.student_practice_allocations (company_id, student_id, course_id, module_type, usage_limit, used_count, status, allocated_by)
    VALUES (v_company_id, v_student_id, v_course_id, 'TDS', 5, 0, 'ACTIVE', v_user_id)
    RETURNING id INTO v_alloc_id;
    RAISE NOTICE 'TDS allocation ID: %', v_alloc_id;

    UPDATE ems.practice_quotas SET used_licenses = used_licenses + 1
    WHERE company_id = v_company_id AND module_type = 'TDS';

    -- INCOME_TAX
    INSERT INTO ems.student_practice_allocations (company_id, student_id, course_id, module_type, usage_limit, used_count, status, allocated_by)
    VALUES (v_company_id, v_student_id, v_course_id, 'INCOME_TAX', 5, 0, 'ACTIVE', v_user_id)
    RETURNING id INTO v_alloc_id;
    RAISE NOTICE 'INCOME_TAX allocation ID: %', v_alloc_id;

    UPDATE ems.practice_quotas SET used_licenses = used_licenses + 1
    WHERE company_id = v_company_id AND module_type = 'INCOME_TAX';

    RAISE NOTICE '✅ Jay student seeded successfully with all 3 practice allocations';
END $$;
