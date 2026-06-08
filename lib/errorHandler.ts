/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * ENTERPRISE ERROR HANDLING SYSTEM
 * Durkkas Innovations Private Limited
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 */

import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { logger } from './logger';
import type { ApiSuccessResponse, ApiErrorResponse } from '@/types/api';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CUSTOM ERROR CLASSES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export class AppError extends Error {
    constructor(
        public code: string,
        message: string,
        public statusCode: number = 500,
        public details?: any,
        public field?: string
    ) {
        super(message);
        this.name = 'AppError';
        Error.captureStackTrace(this, this.constructor);
    }
}

export class ValidationError extends AppError {
    constructor(message: string, details?: any, field?: string) {
        super('VALIDATION_ERROR', message, 400, details, field);
        this.name = 'ValidationError';
    }
}

export class AuthenticationError extends AppError {
    constructor(message: string = 'Authentication failed') {
        super('AUTHENTICATION_ERROR', message, 401);
        this.name = 'AuthenticationError';
    }
}

export class AuthorizationError extends AppError {
    constructor(message: string = 'Permission denied') {
        super('AUTHORIZATION_ERROR', message, 403);
        this.name = 'AuthorizationError';
    }
}

export class NotFoundError extends AppError {
    constructor(resource: string = 'Resource') {
        super('NOT_FOUND', `${resource} not found`, 404);
        this.name = 'NotFoundError';
    }
}

export class ConflictError extends AppError {
    constructor(message: string = 'Resource already exists') {
        super('CONFLICT', message, 409);
        this.name = 'ConflictError';
    }
}

export class RateLimitError extends AppError {
    constructor(message: string = 'Too many requests') {
        super('RATE_LIMIT_EXCEEDED', message, 429);
        this.name = 'RateLimitError';
    }
}

export class DatabaseError extends AppError {
    constructor(message: string = 'Database operation failed', details?: any) {
        super('DATABASE_ERROR', message, 500, details);
        this.name = 'DatabaseError';
    }
}

export class LimitReachedError extends AppError {
    constructor(message: string = 'Plan limit reached', details?: { current: number; max: number; planName: string }) {
        super('LIMIT_REACHED', message, 403, details);
        this.name = 'LimitReachedError';
    }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// RESPONSE BUILDERS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Build success response
 */
export function successResponse<T = any>(
    data: T,
    message: string = 'Success',
    statusCode: number = 200,
    meta?: any
): NextResponse<ApiSuccessResponse<T>> {
    const response: ApiSuccessResponse<T> = {
        success: true,
        data,
        message,
        timestamp: new Date().toISOString(),
        ...(meta && { meta }),
    };

    const jsonString = JSON.stringify(response, (key, value) =>
        typeof value === 'bigint' ? value.toString() : value
    );

    return new NextResponse(jsonString, {
        status: statusCode,
        headers: { 'Content-Type': 'application/json' }
    });
}

/**
 * Build error response
 */
export function errorResponse(
    code: string,
    message: string,
    statusCode: number = 500,
    details?: any,
    field?: string
): NextResponse<ApiErrorResponse> {
    const response: ApiErrorResponse = {
        success: false,
        error: {
            code,
            message,
            ...(details && { details }),
            ...(field && { field }),
        },
        timestamp: new Date().toISOString(),
    };

    // Log error for monitoring
    logger.error('API Error', {
        code,
        message,
        statusCode,
        details,
        field,
    });

    const jsonString = JSON.stringify(response, (key, value) =>
        typeof value === 'bigint' ? value.toString() : value
    );

    return new NextResponse(jsonString, {
        status: statusCode,
        headers: { 'Content-Type': 'application/json' }
    });
}

/**
 * Build paginated success response
 */
export function paginatedResponse<T = any>(
    items: T[],
    page: number,
    limit: number,
    total: number,
    message: string = 'Success'
): NextResponse<ApiSuccessResponse<T[]>> {
    const totalPages = Math.ceil(total / limit);

    return successResponse(
        items,
        message,
        200,
        {
            page,
            limit,
            total,
            totalPages,
            hasNext: page < totalPages,
            hasPrev: page > 1,
        }
    );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ERROR HANDLER MIDDLEWARE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Global error handler for API routes
 * Catches all errors and returns standardized responses
 */
export function handleError(error: unknown): NextResponse<ApiErrorResponse> {
    // Zod validation errors
    if (error instanceof ZodError) {
        const firstError = error.errors[0];
        return errorResponse(
            'VALIDATION_ERROR',
            firstError.message,
            400,
            error.errors,
            firstError.path.join('.')
        );
    }

    // Custom app errors
    if (error instanceof AppError) {
        return errorResponse(
            error.code,
            error.message,
            error.statusCode,
            error.details,
            error.field
        );
    }

    // Supabase/PostgreSQL errors
    if (error && typeof error === 'object' && 'code' in error) {
        const dbError = error as any;

        // Duplicate key violation (23505)
        if (dbError.code === '23505') {
            const detail = dbError.detail || '';
            const message = dbError.message || '';

            // Parse the constraint detail to identify which field caused the duplicate
            let userFriendlyMessage = 'A record with this value already exists';
            let field = undefined;

            // Email duplicate detection
            if (detail.toLowerCase().includes('email') || message.toLowerCase().includes('email')) {
                userFriendlyMessage = 'This email address is already registered in the system. Please use a different email.';
                field = 'email';
            }
            // Phone duplicate detection
            else if (detail.toLowerCase().includes('phone') || message.toLowerCase().includes('phone')) {
                userFriendlyMessage = 'This phone number is already registered. Please use a different phone number.';
                field = 'phone';
            }
            // Employee code duplicate detection
            else if (detail.toLowerCase().includes('employee_code') || message.toLowerCase().includes('employee_code')) {
                userFriendlyMessage = 'This employee code is already assigned to another staff member. Please use a unique employee code.';
                field = 'employee_code';
            }
            // Company code duplicate detection
            else if (detail.toLowerCase().includes('companies') && detail.toLowerCase().includes('code')) {
                userFriendlyMessage = 'This company code is already in use. Please choose a different code.';
                field = 'code';
            }
            // Branch code duplicate detection
            else if (detail.toLowerCase().includes('branches') && detail.toLowerCase().includes('code')) {
                userFriendlyMessage = 'This branch code already exists in your company. Please use a unique branch code.';
                field = 'code';
            }
            // Department code duplicate detection
            else if (detail.toLowerCase().includes('departments') && detail.toLowerCase().includes('code')) {
                userFriendlyMessage = 'This department code already exists in your company. Please use a unique department code.';
                field = 'code';
            }
            // Designation code duplicate detection
            else if (detail.toLowerCase().includes('designations') && detail.toLowerCase().includes('code')) {
                userFriendlyMessage = 'This designation code already exists in your company. Please use a unique designation code.';
                field = 'code';
            }
            // Role name duplicate detection
            else if (detail.toLowerCase().includes('roles') && detail.toLowerCase().includes('name')) {
                userFriendlyMessage = 'A role with this name already exists. Please choose a different role name.';
                field = 'name';
            }
            // Country code/name duplicate detection
            else if (detail.toLowerCase().includes('countries')) {
                userFriendlyMessage = 'This country is already registered in the system.';
                field = 'name';
            }
            // State code duplicate detection
            else if (detail.toLowerCase().includes('states')) {
                userFriendlyMessage = 'This state already exists for the selected country.';
                field = 'code';
            }

            return errorResponse(
                'DUPLICATE_ENTRY',
                userFriendlyMessage,
                409,
                { constraint: dbError.constraint, detail },
                field
            );
        }

        // Foreign key violation (23503)
        if (dbError.code === '23503') {
            const detail = dbError.detail || '';
            let userFriendlyMessage = 'Referenced record does not exist';

            // Parse which reference failed
            if (detail.toLowerCase().includes('company_id')) {
                userFriendlyMessage = 'The specified company does not exist or is not accessible.';
            } else if (detail.toLowerCase().includes('branch_id')) {
                userFriendlyMessage = 'The specified branch does not exist or is not accessible.';
            } else if (detail.toLowerCase().includes('department_id')) {
                userFriendlyMessage = 'The specified department does not exist or is not accessible.';
            } else if (detail.toLowerCase().includes('designation_id')) {
                userFriendlyMessage = 'The specified designation does not exist or is not accessible.';
            } else if (detail.toLowerCase().includes('role_id')) {
                userFriendlyMessage = 'The specified role does not exist or is not accessible.';
            } else if (detail.toLowerCase().includes('user_id')) {
                userFriendlyMessage = 'The specified user does not exist or is not accessible.';
            } else if (detail.toLowerCase().includes('reporting_manager_id')) {
                userFriendlyMessage = 'The specified reporting manager does not exist or is not an active employee.';
            }

            return errorResponse(
                'INVALID_REFERENCE',
                userFriendlyMessage,
                400,
                { constraint: dbError.constraint, detail }
            );
        }

        // Not null violation (23502)
        if (dbError.code === '23502') {
            const detail = dbError.detail || '';
            const column = dbError.column || 'Unknown field';

            // User-friendly field names
            const fieldNames: Record<string, string> = {
                'first_name': 'First Name',
                'last_name': 'Last Name',
                'email': 'Email Address',
                'phone': 'Phone Number',
                'employee_code': 'Employee Code',
                'company_id': 'Company',
                'branch_id': 'Branch',
                'department_id': 'Department',
                'designation_id': 'Designation',
                'name': 'Name',
                'code': 'Code',
                'password_hash': 'Password',
                'role_id': 'Role'
            };

            const friendlyFieldName = fieldNames[column] || column.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase());

            return errorResponse(
                'VALIDATION_ERROR',
                `${friendlyFieldName} is required and cannot be empty.`,
                400,
                { field: column, detail },
                column
            );
        }

        // Check constraint violation (23514)
        if (dbError.code === '23514') {
            const constraint = dbError.constraint || '';
            let userFriendlyMessage = 'Invalid value provided';

            if (constraint.includes('email')) {
                userFriendlyMessage = 'Please enter a valid email address format.';
            } else if (constraint.includes('phone')) {
                userFriendlyMessage = 'Please enter a valid phone number format.';
            }

            return errorResponse(
                'VALIDATION_ERROR',
                userFriendlyMessage,
                400,
                { constraint, detail: dbError.detail }
            );
        }

        // Supabase specific errors
        if (dbError.code === 'PGRST116') {
            return errorResponse(
                'NOT_FOUND',
                'The requested record was not found',
                404
            );
        }

        if (dbError.code === 'PGRST106') {
            return errorResponse(
                'DATABASE_ERROR',
                'Database schema not exposed. Contact administrator.',
                500
            );
        }
    }

    // Generic JavaScript errors
    if (error instanceof Error) {
        logger.error('Unhandled Error', {
            name: error.name,
            message: error.message,
            stack: error.stack,
        });

        // Don't expose internal error details in production
        const message = process.env.NODE_ENV === 'production'
            ? 'An unexpected error occurred'
            : error.message;

        return errorResponse(
            'INTERNAL_SERVER_ERROR',
            message,
            500
        );
    }

    // Unknown error type
    logger.error('Unknown Error Type', { error });
    return errorResponse(
        'INTERNAL_SERVER_ERROR',
        'An unexpected error occurred',
        500
    );
}

/**
 * Async error wrapper for API route handlers
 * Automatically catches and handles errors
 * 
 * @example
 * export const GET = asyncHandler(async (req) => {
 *   const data = await fetchData();
 *   return successResponse(data);
 * });
 */
export function asyncHandler<T extends (...args: any[]) => Promise<NextResponse>>(
    handler: T
): T {
    return (async (...args: any[]) => {
        try {
            return await handler(...args);
        } catch (error) {
            return handleError(error);
        }
    }) as T;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// VALIDATION HELPERS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Validate request body against Zod schema
 * Throws ValidationError if validation fails
 */
export async function validateRequestBody<T>(
    req: Request,
    schema: import('zod').ZodSchema<T>
): Promise<T> {
    try {
        const body = await req.json();
        return schema.parse(body);
    } catch (error) {
        if (error instanceof ZodError) {
            throw new ValidationError(
                error.errors[0].message,
                error.errors,
                error.errors[0].path.join('.')
            );
        }
        throw error;
    }
}

/**
 * Validate query parameters against Zod schema
 */
export function validateQueryParams<T>(
    searchParams: URLSearchParams,
    schema: import('zod').ZodSchema<T>
): T {
    try {
        const params = Object.fromEntries(searchParams.entries());
        return schema.parse(params);
    } catch (error) {
        if (error instanceof ZodError) {
            throw new ValidationError(
                error.errors[0].message,
                error.errors,
                error.errors[0].path.join('.')
            );
        }
        throw error;
    }
}
