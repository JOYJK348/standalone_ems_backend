/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * API HELPER FUNCTIONS & HIGHER-ORDER COMPONENTS
 * Eliminates Code Duplication | Standardizes Patterns | Type-Safe
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 */

import { NextRequest, NextResponse } from 'next/server';
import { ZodSchema } from 'zod';
import { getUserIdFromToken } from './jwt';
import { getUserTenantScope, TenantScope } from '@/middleware/tenantFilter';
import {
    asyncHandler,
    validateRequestBody,
    validateQueryParams,
    AuthenticationError,
    successResponse,
} from './errorHandler';
import type { RequestContext, PaginationParams } from '@/types/api';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TYPE DEFINITIONS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Enhanced request with authentication context
 */
export interface AuthenticatedRequest extends NextRequest {
    context: RequestContext;
}

/**
 * Handler with authentication context
 */
export type AuthenticatedHandler = (
    req: AuthenticatedRequest
) => Promise<NextResponse>;

/**
 * Handler with tenant scope
 */
export type TenantScopedHandler = (
    req: AuthenticatedRequest,
    scope: TenantScope
) => Promise<NextResponse>;

/**
 * Handler with validated body
 */
export type ValidatedHandler<T> = (
    req: AuthenticatedRequest,
    body: T
) => Promise<NextResponse>;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AUTHENTICATION HOC
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Higher-Order Component for authentication
 * Verifies JWT token and attaches user context to request
 * 
 * @example
 * export const GET = withAuth(async (req) => {
 *   const userId = req.context.userId;
 *   // Your logic here
 * });
 */
export function withAuth(
    handler: AuthenticatedHandler
): (req: NextRequest) => Promise<NextResponse> {
    return asyncHandler(async (req: NextRequest) => {
        // Extract and verify token
        const userId = await getUserIdFromToken(req);

        if (!userId) {
            throw new AuthenticationError('Authentication required');
        }

        // Get user's tenant scope
        const scope = await getUserTenantScope(userId);

        // Extract client info
        const ipAddress = req.headers.get('x-forwarded-for')?.split(',')[0].trim()
            || req.headers.get('x-real-ip')
            || req.ip
            || 'unknown';

        const userAgent = req.headers.get('user-agent') || 'unknown';

        // Build request context
        const context: RequestContext = {
            userId,
            email: '', // Will be populated from token if needed
            roles: [], // Will be populated from scope
            companyId: scope.companyId,
            branchId: scope.branchId,
            roleLevel: scope.roleLevel,
            ipAddress,
            userAgent,
        };

        // Attach context to request
        const authenticatedReq = req as AuthenticatedRequest;
        authenticatedReq.context = context;

        // Call the handler
        return await handler(authenticatedReq);
    });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TENANT SCOPE HOC
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Higher-Order Component for tenant scope
 * Automatically applies multi-tenant filtering
 * 
 * @example
 * export const GET = withTenantScope(async (req, scope) => {
 *   // scope.companyId is automatically available
 *   // Queries will be automatically filtered
 * });
 */
export function withTenantScope(
    handler: TenantScopedHandler
): (req: NextRequest) => Promise<NextResponse> {
    return withAuth(async (req: AuthenticatedRequest) => {
        const scope = await getUserTenantScope(req.context.userId);
        return await handler(req, scope);
    });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// VALIDATION HOC
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Higher-Order Component for request body validation
 * Validates request body against Zod schema
 * 
 * @example
 * export const POST = withValidation(loginSchema, async (req, body) => {
 *   // body is typed and validated
 *   const { email, password } = body;
 * });
 */
export function withValidation<T>(
    schema: ZodSchema<T>,
    handler: ValidatedHandler<T>
): (req: NextRequest) => Promise<NextResponse> {
    return withAuth(async (req: AuthenticatedRequest) => {
        const body = await validateRequestBody(req, schema);
        return await handler(req, body);
    });
}

/**
 * Validation with tenant scope
 */
export function withValidationAndTenant<T>(
    schema: ZodSchema<T>,
    handler: (req: AuthenticatedRequest, body: T, scope: TenantScope) => Promise<NextResponse>
): (req: NextRequest) => Promise<NextResponse> {
    return withAuth(async (req: AuthenticatedRequest) => {
        const body = await validateRequestBody(req, schema);
        const scope = await getUserTenantScope(req.context.userId);
        return await handler(req, body, scope);
    });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PAGINATION HELPERS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Extract and validate pagination parameters from request
 */
export function getPaginationParams(req: NextRequest): PaginationParams {
    const searchParams = req.nextUrl.searchParams;

    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = Math.min(
        parseInt(searchParams.get('limit') || '10', 10),
        100 // Max limit
    );
    const sortBy = searchParams.get('sortBy') || undefined;
    const sortOrder = (searchParams.get('sortOrder') || 'asc') as 'asc' | 'desc';

    return {
        page: Math.max(1, page),
        limit: Math.max(1, limit),
        sortBy,
        sortOrder,
    };
}

/**
 * Calculate pagination offset
 */
export function getPaginationOffset(params: PaginationParams): {
    offset: number;
    limit: number;
} {
    return {
        offset: (params.page - 1) * params.limit,
        limit: params.limit,
    };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// QUERY HELPERS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Apply pagination to Supabase query
 */
export function applyPagination<T>(
    query: any,
    params: PaginationParams
): any {
    const { offset, limit } = getPaginationOffset(params);

    let paginatedQuery = query.range(offset, offset + limit - 1);

    // Apply sorting if specified
    if (params.sortBy) {
        paginatedQuery = paginatedQuery.order(params.sortBy, {
            ascending: params.sortOrder === 'asc',
        });
    }

    return paginatedQuery;
}

/**
 * Apply search filter to query
 */
export function applySearch(
    query: any,
    searchTerm: string | null,
    searchColumns: string[]
): any {
    if (!searchTerm || searchColumns.length === 0) {
        return query;
    }

    // Build OR condition for search across multiple columns
    const searchConditions = searchColumns
        .map(col => `${col}.ilike.%${searchTerm}%`)
        .join(',');

    return query.or(searchConditions);
}

/**
 * Apply date range filter
 */
export function applyDateRange(
    query: any,
    column: string,
    dateFrom?: string,
    dateTo?: string
): any {
    if (dateFrom) {
        query = query.gte(column, dateFrom);
    }

    if (dateTo) {
        query = query.lte(column, dateTo);
    }

    return query;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// RESPONSE HELPERS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Build paginated response with total count
 */
export async function buildPaginatedResponse<T>(
    query: any,
    countQuery: any,
    params: PaginationParams,
    message: string = 'Success'
): Promise<NextResponse> {
    // Execute both queries in parallel
    const [{ data, error }, { count, error: countError }] = await Promise.all([
        query,
        countQuery.count(),
    ]);

    if (error || countError) {
        throw new Error(error?.message || countError?.message || 'Query failed');
    }

    const totalPages = Math.ceil((count || 0) / params.limit);

    return successResponse(
        data || [],
        message,
        200,
        {
            page: params.page,
            limit: params.limit,
            total: count || 0,
            totalPages,
            hasNext: params.page < totalPages,
            hasPrev: params.page > 1,
        }
    );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// COMPOSITE HOCs
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Complete API route wrapper with all common functionality
 * Auth + Tenant Scope + Validation + Error Handling
 * 
 * @example
 * export const POST = apiRoute({
 *   schema: createEmployeeSchema,
 *   handler: async (req, body, scope) => {
 *     // Everything is set up and validated
 *     const employee = await createEmployee(body, scope.companyId);
 *     return successResponse(employee, 'Employee created');
 *   }
 * });
 */
export function apiRoute<T>(config: {
    schema?: ZodSchema<T>;
    requireAuth?: boolean;
    requireTenant?: boolean;
    handler: (
        req: AuthenticatedRequest,
        body?: T,
        scope?: TenantScope
    ) => Promise<NextResponse>;
}): (req: NextRequest) => Promise<NextResponse> {
    const {
        schema,
        requireAuth = true,
        requireTenant = true,
        handler,
    } = config;

    return asyncHandler(async (req: NextRequest) => {
        let authenticatedReq: AuthenticatedRequest | undefined;
        let scope: TenantScope | undefined;
        let body: T | undefined;

        // Apply authentication if required
        if (requireAuth) {
            const userId = await getUserIdFromToken(req);
            if (!userId) {
                throw new AuthenticationError('Authentication required');
            }

            // Build context
            const ipAddress = req.headers.get('x-forwarded-for')?.split(',')[0].trim()
                || req.headers.get('x-real-ip')
                || req.ip
                || 'unknown';

            const userAgent = req.headers.get('user-agent') || 'unknown';

            authenticatedReq = req as AuthenticatedRequest;
            authenticatedReq.context = {
                userId,
                email: '',
                roles: [],
                companyId: null,
                branchId: null,
                roleLevel: 0,
                ipAddress,
                userAgent,
            };

            // Get tenant scope if required
            if (requireTenant) {
                scope = await getUserTenantScope(userId);
                authenticatedReq.context.companyId = scope.companyId;
                authenticatedReq.context.branchId = scope.branchId;
                authenticatedReq.context.roleLevel = scope.roleLevel;
            }
        }

        // Validate body if schema provided
        if (schema) {
            body = await validateRequestBody(req, schema);
        }

        // Call handler
        return await handler(
            authenticatedReq || (req as AuthenticatedRequest),
            body,
            scope
        );
    });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// All functions are exported inline above
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

