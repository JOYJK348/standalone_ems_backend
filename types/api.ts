/**
 * API Type Definitions
 * Centralized types for all API requests and responses
 */

import { z } from 'zod';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// STANDARD API RESPONSE TYPES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface ApiSuccessResponse<T = any> {
    success: true;
    data: T;
    message?: string;
    timestamp: string;
    meta?: {
        page?: number;
        limit?: number;
        total?: number;
        totalPages?: number;
    };
}

export interface ApiErrorResponse {
    success: false;
    error: {
        code: string;
        message: string;
        details?: any;
        field?: string;
    };
    timestamp: string;
}

export type ApiResponse<T = any> = ApiSuccessResponse<T> | ApiErrorResponse;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PAGINATION TYPES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface PaginationParams {
    page: number;
    limit: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
    items: T[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
        hasNext: boolean;
        hasPrev: boolean;
    };
}

// Zod schema for pagination validation
export const paginationSchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10),
    sortBy: z.string().optional(),
    sortOrder: z.enum(['asc', 'desc']).optional().default('asc'),
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FILTER TYPES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface FilterParams {
    search?: string;
    status?: string;
    dateFrom?: string;
    dateTo?: string;
    [key: string]: any;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// REQUEST CONTEXT (Attached to all authenticated requests)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface RequestContext {
    userId: number;
    email: string;
    roles: string[];
    companyId: number | null;
    branchId: number | null;
    roleLevel: number;
    ipAddress: string;
    userAgent: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AUTH API TYPES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const loginSchema = z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
});

export type LoginRequest = z.infer<typeof loginSchema>;

export interface LoginResponse {
    user: {
        id: number;
        email: string;
        firstName: string | null;
        lastName: string | null;
        roles: Array<{
            id: number;
            name: string;
            display_name: string | null;
        }>;
    };
    tokens: {
        accessToken: string;
        refreshToken: string;
    };
}

export const refreshTokenSchema = z.object({
    refreshToken: z.string().min(1, 'Refresh token is required'),
});

export type RefreshTokenRequest = z.infer<typeof refreshTokenSchema>;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CORE API TYPES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const createCompanySchema = z.object({
    name: z.string().min(1, 'Company name is required'),
    legal_name: z.string().optional(),
    company_code: z.string().min(1, 'Company code is required'),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    is_active: z.boolean().default(true),
});

export type CreateCompanyRequest = z.infer<typeof createCompanySchema>;

export const updateCompanySchema = createCompanySchema.partial();
export type UpdateCompanyRequest = z.infer<typeof updateCompanySchema>;

export const createBranchSchema = z.object({
    company_id: z.number().int().positive(),
    name: z.string().min(1, 'Branch name is required'),
    branch_code: z.string().min(1, 'Branch code is required'),
    branch_type: z.enum(['HQ', 'OPERATIONAL', 'FRANCHISE']),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    city_id: z.number().int().positive().optional(),
    is_active: z.boolean().default(true),
});

export type CreateBranchRequest = z.infer<typeof createBranchSchema>;

export const updateBranchSchema = createBranchSchema.partial().omit({ company_id: true });
export type UpdateBranchRequest = z.infer<typeof updateBranchSchema>;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HRMS API TYPES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const createEmployeeSchema = z.object({
    employee_code: z.string().min(1, 'Employee code is required'),
    first_name: z.string().min(1, 'First name is required'),
    last_name: z.string().optional(),
    date_of_birth: z.string().optional(),
    gender: z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    company_id: z.number().int().positive(),
    branch_id: z.number().int().positive(),
    department_id: z.number().int().positive().optional(),
    designation_id: z.number().int().positive().optional(),
    reporting_to: z.number().int().positive().optional(),
    employment_type: z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN']),
    date_of_joining: z.string(),
    user_id: z.number().int().positive().optional(),
    is_active: z.boolean().default(true),
});

export type CreateEmployeeRequest = z.infer<typeof createEmployeeSchema>;

export const updateEmployeeSchema = createEmployeeSchema.partial().omit({
    company_id: true,
    employee_code: true
});
export type UpdateEmployeeRequest = z.infer<typeof updateEmployeeSchema>;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// VALIDATION HELPERS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function validateSchema<T>(schema: z.ZodSchema<T>, data: unknown): T {
    return schema.parse(data);
}

export function validateSchemaAsync<T>(
    schema: z.ZodSchema<T>,
    data: unknown
): Promise<T> {
    return schema.parseAsync(data);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// EXPORT ALL SCHEMAS FOR REUSE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const schemas = {
    auth: {
        login: loginSchema,
        refreshToken: refreshTokenSchema,
    },
    core: {
        createCompany: createCompanySchema,
        updateCompany: updateCompanySchema,
        createBranch: createBranchSchema,
        updateBranch: updateBranchSchema,
    },
    hrms: {
        createEmployee: createEmployeeSchema,
        updateEmployee: updateEmployeeSchema,
    },
    common: {
        pagination: paginationSchema,
    },
};
