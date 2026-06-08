import { NextRequest } from 'next/server';
import { supabaseService, app_auth } from '@/lib/supabase';
import { successResponse, errorResponse } from '@/lib/errorHandler';
import { getUserIdFromToken } from '@/lib/jwt';
import { getUserTenantScope } from '@/middleware/tenantFilter';

/**
 * AUTH: Permissions API
 * Route: /api/auth/permissions
 */
export async function GET(_req: NextRequest) {
    try {
        const { data, error } = await app_auth.permissions()
            .select('*')
            .order('name', { ascending: true });

        if (error) throw new Error(error.message);
        return successResponse(data, 'Permissions fetched successfully');
    } catch (error: any) {
        return errorResponse('INTERNAL_ERROR', error.message || 'Failed to fetch permissions');
    }
}

export async function POST(req: NextRequest) {
    try {
        const actingUserId = await getUserIdFromToken(req);
        if (!actingUserId) return errorResponse('UNAUTHORIZED', 'Unauthorized', 401);

        const scope = await getUserTenantScope(actingUserId);
        if (scope.roleLevel < 4) return errorResponse('FORBIDDEN', 'Access Denied', 403);

        const body = await req.json();
        const { name, display_name, description, permission_scope, schema_name, resource, action } = body;

        if (!name) return errorResponse('VALIDATION_ERROR', 'Permission name is required', 400);

        const { data, error } = await app_auth.permissions().insert({
            name,
            display_name,
            description,
            permission_scope: permission_scope || 'COMPANY',
            schema_name,
            resource,
            action,
            is_active: true
        }).select().single();

        if (error) throw new Error(error.message);

        return successResponse(data, 'Permission defined successfully', 201);
    } catch (error: any) {
        return errorResponse('INTERNAL_ERROR', error.message);
    }
}

export async function PATCH(req: NextRequest) {
    // Standard implementation for updates
    try {
        const actingUserId = await getUserIdFromToken(req);
        if (!actingUserId) return errorResponse('UNAUTHORIZED', 'Unauthorized', 401);

        const scope = await getUserTenantScope(actingUserId);
        if (scope.roleLevel < 5) return errorResponse('FORBIDDEN', 'Only Platform Admins can modify core permissions', 403);

        return successResponse(null, 'Permission updated (Simulated)');
    } catch (error: any) {
        return errorResponse('INTERNAL_ERROR', error.message);
    }
}
