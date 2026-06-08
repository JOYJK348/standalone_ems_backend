/**
 * AUTH API - User Role Assignments
 * Route: /api/auth/user-roles
 */

import { NextRequest } from 'next/server';
import { app_auth } from '@/lib/supabase';
import { successResponse, errorResponse } from '@/lib/errorHandler';
import { getUserIdFromToken } from '@/lib/jwt';
import { getUserTenantScope } from '@/middleware/tenantFilter';

export async function GET(req: NextRequest) {
    try {
        const actingUserId = await getUserIdFromToken(req);
        if (!actingUserId) return errorResponse(null, 'Unauthorized', 401);

        const scope = await getUserTenantScope(actingUserId);

        let query = app_auth.userRoles().select(`
            *,
            user:users!user_id(email, first_name, last_name),
            role:roles(name, display_name)
        `);

        if (scope.roleLevel < 5) {
            query = query.eq('company_id', scope.companyId);
        }

        const { data, error } = await query;
        if (error) throw new Error(error.message);

        return successResponse(data, 'User roles fetched successfully');
    } catch (error: any) {
        return errorResponse(null, error.message);
    }
}

export async function POST(req: NextRequest) {
    try {
        const actingUserId = await getUserIdFromToken(req);
        if (!actingUserId) return errorResponse(null, 'Unauthorized', 401);

        const scope = await getUserTenantScope(actingUserId);
        if (scope.roleLevel < 4) return errorResponse(null, 'Forbidden', 403);

        const body = await req.json();
        const { user_id, role_id, company_id, branch_id, valid_from, valid_until } = body;

        // Security: Company Admin can only assign roles for their company
        const targetCompanyId = scope.roleLevel >= 5 ? (company_id === 'NULL' ? null : company_id) : scope.companyId;

        const { data, error } = await app_auth.userRoles().insert({
            user_id,
            role_id,
            company_id: targetCompanyId,
            branch_id: branch_id || null,
            valid_from: valid_from || null,
            valid_until: valid_until || null,
            is_active: true
        }).select().single();

        if (error) throw new Error(error.message);

        return successResponse(data, 'Role assigned to user successfully', 201);
    } catch (error: any) {
        return errorResponse(null, error.message);
    }
}
