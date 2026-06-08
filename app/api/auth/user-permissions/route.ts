/**
 * AUTH API - User Specific Permissions (Overrides)
 * Route: /api/auth/user-permissions
 */

import { NextRequest } from 'next/server';
import { app_auth } from '@/lib/supabase';
import { successResponse, errorResponse } from '@/lib/errorHandler';
import { getUserIdFromToken } from '@/lib/jwt';
import { getUserTenantScope } from '@/middleware/tenantFilter';

export async function GET(req: NextRequest) {
    try {
        const actingUserId = await getUserIdFromToken(req);
        if (!actingUserId) return errorResponse('UNAUTHORIZED', 'Unauthorized', 401);

        const { searchParams } = new URL(req.url);
        const userId = searchParams.get('userId');

        let query = app_auth.userPermissions().select('*, permission:permissions(name, display_name)');

        if (userId) {
            query = query.eq('user_id', userId);
        }

        const { data, error } = await query;
        if (error) throw new Error(error.message);

        return successResponse(data, 'User permissions fetched successfully');
    } catch (error: any) {
        return errorResponse('INTERNAL_ERROR', error.message);
    }
}

export async function POST(req: NextRequest) {
    try {
        const actingUserId = await getUserIdFromToken(req);
        if (!actingUserId) return errorResponse('UNAUTHORIZED', 'Unauthorized', 401);

        const scope = await getUserTenantScope(actingUserId);
        if (scope.roleLevel < 4) return errorResponse('FORBIDDEN', 'Forbidden: Company Admin access required', 403);

        const body = await req.json();
        const { userId, permissionIds } = body;

        if (!userId || !Array.isArray(permissionIds)) {
            return errorResponse('VALIDATION_ERROR', 'User ID and Permission IDs (array) are required', 400);
        }

        // 1. Delete existing overrides for this user in this company context
        await app_auth.userPermissions()
            .delete()
            .eq('user_id', userId)
            .eq('company_id', scope.companyId);

        // 2. Insert new overrides
        if (permissionIds.length > 0) {
            const inserts = permissionIds.map(pid => ({
                user_id: userId,
                permission_id: pid,
                company_id: scope.companyId,
                created_by: actingUserId
            }));

            const { error: insertError } = await app_auth.userPermissions().insert(inserts);
            if (insertError) throw new Error(insertError.message);
        }

        return successResponse(null, 'User overrides synchronized successfully');
    } catch (error: any) {
        return errorResponse('INTERNAL_ERROR', error.message);
    }
}
