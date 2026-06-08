import { z } from 'zod';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. STUDENT SCHEMAS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const studentSchema = z.object({
    company_id: z.coerce.number(),
    branch_id: z.coerce.number().optional().nullable(),
    user_id: z.coerce.number().optional().nullable(),
    student_code: z.string().min(1, 'Student code is required'),
    first_name: z.string().min(1, 'First name is required'),
    middle_name: z.string().optional().nullable(),
    last_name: z.string().optional().nullable(),
    date_of_birth: z.string().optional().nullable(),
    gender: z.string().optional().nullable(),
    email: z.string().email('Invalid email address').optional().nullable(),
    phone: z.string().optional().nullable(),
    address_line1: z.string().optional().nullable(),
    address_line2: z.string().optional().nullable(),
    city: z.string().optional().nullable(),
    state: z.string().optional().nullable(),
    country: z.string().default('India'),
    postal_code: z.string().optional().nullable(),
    profile_url: z.string().url().optional().nullable(),
    status: z.string().default('ACTIVE'),
});

export const studentGuardianSchema = z.object({
    company_id: z.coerce.number(),
    student_id: z.coerce.number(),
    guardian_name: z.string().min(1, 'Guardian name is required'),
    relationship: z.string().optional().nullable(),
    phone: z.string().optional().nullable(),
    email: z.string().email().optional().nullable(),
    occupation: z.string().optional().nullable(),
    address: z.string().optional().nullable(),
    is_primary: z.boolean().default(false),
    is_emergency_contact: z.boolean().default(false),
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2. COURSE SCHEMAS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const courseSchema = z.object({
    company_id: z.coerce.number(),
    branch_id: z.coerce.number().optional().nullable(),
    tutor_id: z.coerce.number().optional().nullable(),
    course_code: z.string().min(1, 'Course code is required'),
    course_name: z.string().min(1, 'Course name is required'),
    course_description: z.string().optional().nullable(),
    course_category: z.string().optional().nullable(),
    course_level: z.string().optional().nullable(),
    course_type: z.string().optional().nullable(),
    duration_hours: z.coerce.number().optional().nullable(),
    total_lessons: z.coerce.number().default(0),
    enrollment_capacity: z.coerce.number().optional().nullable(),
    price: z.coerce.number().default(0),
    thumbnail_url: z.preprocess(
        (v) => (v === '' ? null : v),
        z.string().url().optional().nullable()
    ),
    syllabus_url: z.preprocess(
        (v) => (v === '' ? null : v),
        z.string().url().optional().nullable()
    ),
    start_date: z.string().optional().nullable(),
    end_date: z.string().optional().nullable(),
    is_published: z.boolean().default(false),
    status: z.string().default('DRAFT'),
});

export const courseModuleSchema = z.object({
    company_id: z.coerce.number(),
    course_id: z.coerce.number(),
    parent_module_id: z.coerce.number().optional().nullable(),
    module_name: z.string().min(1, 'Module name is required'),
    module_description: z.string().optional().nullable(),
    module_order: z.coerce.number().default(0),
    duration_hours: z.coerce.number().optional().nullable(),
    is_mandatory: z.boolean().default(true),
});

export const lessonSchema = z.object({
    company_id: z.coerce.number(),
    course_id: z.coerce.number(),
    module_id: z.coerce.number().optional().nullable(),
    lesson_name: z.string().min(1, 'Lesson name is required'),
    lesson_description: z.string().optional().nullable(),
    lesson_type: z.string().optional().nullable(),
    lesson_order: z.coerce.number().default(0),
    duration_minutes: z.coerce.number().optional().nullable(),
    video_url: z.string().url().optional().nullable(),
    is_preview: z.boolean().default(false),
    is_mandatory: z.boolean().default(true),
});

export const courseMaterialSchema = z.object({
    company_id: z.coerce.number(),
    course_id: z.coerce.number().optional().nullable(),
    batch_id: z.coerce.number().optional().nullable(),
    menu_id: z.coerce.number().optional().nullable(),
    module_id: z.coerce.number().optional().nullable(),
    lesson_id: z.coerce.number().optional().nullable(),
    material_name: z.string().min(1, 'Material name is required'),
    material_description: z.string().optional().nullable(),
    material_type: z.string().default('DOCUMENT'),
    file_url: z.string().optional().nullable(),
    delivery_method: z.enum(['FILE', 'CONTENT']).default('FILE'),
    content_json: z.any().optional().nullable(),
    file_size_mb: z.coerce.number().optional().nullable(),
    handbook_type: z.enum(['TUTOR_HANDBOOK', 'STUDENT_HANDBOOK', 'GENERAL_RESOURCE']).default('STUDENT_HANDBOOK'),
    target_audience: z.enum(['TUTORS', 'STUDENTS', 'BOTH']).default('STUDENTS'),
    is_active: z.boolean().default(true),
    is_downloadable: z.boolean().default(true),
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 3. ACADEMIC OPERATIONS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const batchSchema = z.object({
    company_id: z.coerce.number(),
    branch_id: z.coerce.number().optional().nullable(),
    course_id: z.coerce.number(),
    batch_code: z.string().min(1, 'Batch code is required'),
    batch_name: z.string().min(1, 'Batch name is required'),
    batch_type: z.string().optional().nullable(),
    start_date: z.string().transform(v => v === "" ? null : v).optional().nullable(),
    end_date: z.string().transform(v => v === "" ? null : v).optional().nullable(),
    start_time: z.string().transform(v => v === "" ? null : v).optional().nullable(),
    end_time: z.string().transform(v => v === "" ? null : v).optional().nullable(),
    max_students: z.coerce.number().optional().nullable(),
    status: z.string().default('PLANNED'),
    schedule_details: z.string().optional().nullable(),
});

export const enrollmentSchema = z.object({
    company_id: z.coerce.number(),
    student_id: z.coerce.number(),
    course_id: z.coerce.number(),
    batch_id: z.coerce.number().optional().nullable(),
    enrollment_date: z.string().optional(),
    enrollment_status: z.string().default('ACTIVE'),
    payment_status: z.string().default('PENDING'),
    payment_amount: z.coerce.number().optional().nullable(),
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 4. ASSESSMENT SCHEMAS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const quizSchema = z.object({
    company_id: z.coerce.number(),
    course_id: z.coerce.number(),
    module_id: z.coerce.number().optional().nullable(),
    lesson_id: z.coerce.number().optional().nullable(),
    quiz_title: z.string().min(1, 'Quiz title is required'),
    quiz_description: z.string().optional().nullable(),
    quiz_type: z.string().optional().nullable(),
    total_marks: z.coerce.number().optional().nullable(),
    passing_marks: z.coerce.number().optional().nullable(),
    duration_minutes: z.coerce.number().optional().nullable(),
    max_attempts: z.coerce.number().default(1),
    shuffle_questions: z.boolean().default(false),
    show_answers_after: z.boolean().default(true),
});

export const assignmentSchema = z.object({
    company_id: z.coerce.number(),
    course_id: z.coerce.number(),
    batch_id: z.coerce.number().optional().nullable(),
    module_id: z.coerce.number().optional().nullable(),
    lesson_id: z.coerce.number().optional().nullable(),
    tutor_id: z.coerce.number().optional().nullable(),
    assignment_title: z.string().min(1, 'Assignment title is required'),
    assignment_description: z.string().optional().nullable(),
    assignment_type: z.string().optional().nullable(),
    submission_mode: z.enum(['ONLINE', 'OFFLINE']).optional().nullable(),
    max_marks: z.coerce.number().optional().nullable(),
    passing_marks: z.coerce.number().optional().nullable(),
    deadline: z.string().optional().nullable(),
    allow_late_submission: z.boolean().default(false),
    is_mandatory: z.boolean().default(true),
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 5. PROGRESS TRACKING
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const lessonProgressSchema = z.object({
    company_id: z.coerce.number(),
    student_id: z.coerce.number(),
    enrollment_id: z.coerce.number(),
    lesson_id: z.coerce.number(),
    course_id: z.coerce.number(),
    is_completed: z.boolean().default(false),
    completion_percentage: z.coerce.number().min(0).max(100).default(0),
    time_spent_minutes: z.coerce.number().default(0),
    notes: z.string().optional().nullable(),
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 6. LIVE CLASS SCHEMAS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const liveClassSchema = z.object({
    company_id: z.coerce.number(),
    course_id: z.coerce.number(),
    batch_id: z.coerce.number().optional().nullable(),
    tutor_id: z.coerce.number().optional().nullable(),
    class_title: z.string().min(1, 'Class title is required'),
    class_description: z.string().optional().nullable(),
    scheduled_date: z.string().min(1, 'Scheduled date is required'),
    scheduled_time: z.string().min(1, 'Scheduled time is required'),
    duration_minutes: z.coerce.number().default(60),
    meeting_link: z.string().url().optional().nullable(),
    meeting_platform: z.string().default('ZOOM'),
    meeting_password: z.string().optional().nullable(),
    recording_url: z.string().url().optional().nullable(),
    status: z.string().default('SCHEDULED'),
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 7. ATTENDANCE SCHEMAS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const attendanceSessionSchema = z.object({
    company_id: z.coerce.number(),
    batch_id: z.coerce.number().optional().nullable(),
    course_id: z.coerce.number(),
    lesson_id: z.coerce.number().optional().nullable(),
    session_date: z.string().default(() => new Date().toISOString().split('T')[0]),
    session_type: z.string().default('REGULAR'),
    class_mode: z.enum(['ONLINE', 'OFFLINE', 'HYBRID']).default('OFFLINE'),
    require_face_verification: z.boolean().default(false),
    require_location_verification: z.boolean().default(false),
    start_time: z.string().optional().nullable(),
    end_time: z.string().optional().nullable(),
    live_class_id: z.coerce.number().optional().nullable(),
    taken_by: z.coerce.number().optional().nullable(),
    remarks: z.string().optional().nullable(),
});

export const attendanceRecordSchema = z.object({
    company_id: z.coerce.number(),
    session_id: z.coerce.number(),
    student_id: z.coerce.number(),
    status: z.enum(['PRESENT', 'ABSENT', 'LATE', 'EXCUSED']).default('PRESENT'),
    check_in_time: z.string().optional().nullable(),
    check_out_time: z.string().optional().nullable(),
    remarks: z.string().optional().nullable(),

    // Verification Fields
    latitude: z.coerce.number().optional().nullable(),
    longitude: z.coerce.number().optional().nullable(),
    location_accuracy: z.coerce.number().optional().nullable(),
    device_id: z.string().optional().nullable(),
    ip_address: z.string().optional().nullable(),
    verification_method: z.string().optional().nullable(), // MANUAL, FACE, QR, GEOFENCE
});

