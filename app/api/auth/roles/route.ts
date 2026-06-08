/**
 * AUTH API - System Roles
 * Route: /api/auth/roles
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

        const { data, error } = await app_auth.roles().select('*').order('level', { ascending: false });
        if (error) throw new Error(error.message);

        return successResponse(data, 'Roles fetched successfully');
    } catch (error: any) {
        return errorResponse(null, error.message);
    }
}

export async function POST(req: NextRequest) {
    try {
        const actingUserId = await getUserIdFromToken(req);
        if (!actingUserId) return errorResponse(null, 'Unauthorized', 401);

        const scope = await getUserTenantScope(actingUserId);
        if (scope.roleLevel < 5) return errorResponse(null, 'Forbidden: Only Platform Admin can define roles', 403);

        const body = await req.json();
        const { name, display_name, description, level, role_type, product } = body;

        if (!name) return errorResponse(null, 'Role name is required', 400);

        const { data, error } = await app_auth.roles().insert({
            name,
            display_name,
            description,
            level: level || 0,
            role_type: role_type || 'CUSTOM',
            product: product || null,
            is_active: true,
            is_system_role: false
        }).select().single();

        if (error) throw new Error(error.message);

        return successResponse(data, 'Role defined successfully', 201);
    } catch (error: any) {
        return errorResponse(null, error.message);
    }
}
