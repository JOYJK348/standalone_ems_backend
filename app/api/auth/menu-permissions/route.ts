/**
 * AUTH API - Menu Permissions
 * Route: /api/auth/menu-permissions
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

        const { data, error } = await app_auth.menuPermissions().select(`
            *,
            menu:menu_registry(menu_name, menu_key, display_name),
            permission:permissions(name, display_name)
        `);

        if (error) throw new Error(error.message);
        return successResponse(data, 'Menu permissions fetched successfully');
    } catch (error: any) {
        return errorResponse(null, error.message);
    }
}

export async function POST(req: NextRequest) {
    try {
        const actingUserId = await getUserIdFromToken(req);
        if (!actingUserId) return errorResponse(null, 'Unauthorized', 401);

        const scope = await getUserTenantScope(actingUserId);
        if (scope.roleLevel < 5) {
            return errorResponse(null, 'Forbidden: Only Platform Admin can manage menu permissions', 403);
        }

        const body = await req.json();
        const { menu_id, permission_id } = body;

        if (!menu_id || !permission_id) {
            return errorResponse(null, 'Menu ID and Permission ID are required', 400);
        }

        const { data, error } = await app_auth.menuPermissions().insert({
            menu_id,
            permission_id
        }).select().single();

        if (error) throw new Error(error.message);

        return successResponse(data, 'Menu access rule established successfully', 201);
    } catch (error: any) {
        return errorResponse(null, error.message);
    }
}
