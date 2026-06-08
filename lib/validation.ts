/**
 * Input Validation Schemas
 * 
 * Centralized Zod schemas for request validation
 */

import { z } from 'zod';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AUTH SCHEMAS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const loginSchema = z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const registerSchema = z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters')
        .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
        .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
        .regex(/[0-9]/, 'Password must contain at least one number'),
    firstName: z.string().min(1, 'First name is required'),
    lastName: z.string().optional(),
});

export const changePasswordSchema = z.object({
    oldPassword: z.string().min(1, 'Old password is required'),
    newPassword: z.string().min(8, 'Password must be at least 8 characters')
        .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
        .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
        .regex(/[0-9]/, 'Password must contain at least one number'),
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HRMS SCHEMAS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const createEmployeeSchema = z.object({
    employee_code: z.string().min(3, 'Employee code must be at least 3 characters'),
    first_name: z.string().min(1, 'First name is required'),
    last_name: z.string().optional(),
    email: z.string().email('Invalid email address'),
    phone: z.string().min(10, 'Phone number must be at least 10 digits'),
    branch_id: z.number().int().positive(),
    department_id: z.number().int().positive().optional(),
    designation_id: z.number().int().positive().optional(),
    date_of_joining: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)'),
    employment_type: z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN']).default('FULL_TIME'),
});

export const updateEmployeeSchema = createEmployeeSchema.partial();

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// EMS SCHEMAS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const createStudentSchema = z.object({
    student_code: z.string().min(3, 'Student code must be at least 3 characters'),
    first_name: z.string().min(1, 'First name is required'),
    last_name: z.string().optional(),
    email: z.string().email('Invalid email address'),
    phone: z.string().min(10, 'Phone number must be at least 10 digits'),
    branch_id: z.number().int().positive(),
    academic_year_id: z.number().int().positive().optional(),
    enrollment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const createCourseSchema = z.object({
    name: z.string().min(1, 'Course name is required'),
    code: z.string().min(2, 'Course code must be at least 2 characters'),
    description: z.string().optional(),
    course_type: z.enum(['ONLINE', 'OFFLINE', 'HYBRID']).default('ONLINE'),
    duration_hours: z.number().int().positive().optional(),
    fee: z.number().positive().optional(),
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CRM SCHEMAS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const createLeadSchema = z.object({
    name: z.string().min(1, 'Name is required'),
    email: z.string().email('Invalid email address').optional(),
    phone: z.string().min(10, 'Phone number must be at least 10 digits'),
    branch_id: z.number().int().positive(),
    lead_source_id: z.number().int().positive().optional(),
    interested_in: z.string().optional(),
});

export const createFollowupSchema = z.object({
    lead_id: z.number().int().positive(),
    followup_type: z.enum(['CALL', 'EMAIL', 'MEETING', 'WHATSAPP']),
    notes: z.string().optional(),
    next_followup_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// COMMON SCHEMAS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const paginationSchema = z.object({
    page: z.string().regex(/^\d+$/).transform(Number).default('1'),
    limit: z.string().regex(/^\d+$/).transform(Number).default('10'),
    search: z.string().optional(),
    sortBy: z.string().optional(),
    sortOrder: z.enum(['asc', 'desc']).optional(),
});

export const idSchema = z.object({
    id: z.string().regex(/^\d+$/).transform(Number),
});
