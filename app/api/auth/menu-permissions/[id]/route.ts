/**
 * AUTH API - Menu Permission Operations (Individual)
 * Route: /api/auth/menu-permissions/[id]
 */

import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/errorHandler';
import { app_auth } from '@/lib/supabase';
import { getUserTenantScope } from '@/middleware/tenantFilter';
import { getUserIdFromToken } from '@/lib/jwt';
import { AuditService } from '@/lib/services/AuditService';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse(null, 'Unauthorized', 401);
        const scope = await getUserTenantScope(userId);
        if (scope.roleLevel < 5) return errorResponse(null, 'Forbidden: Platform Admin only', 403);
        const { id } = params;

        const updates = await req.json();
        const { data: oldData } = await app_auth.menuPermissions().select('*').eq('id', id).single();
        if (!oldData) return errorResponse(null, 'Access rule not found', 404);

        const { data, error } = await app_auth.menuPermissions().update(updates).eq('id', id).select().single();
        if (error) throw new Error(error.message);

        await AuditService.logAction({
            userId,
            action: 'UPDATE',
            tableName: 'menu_permissions',
            recordId: id,
            oldData,
            newData: data,
            ipAddress: AuditService.getIP(req)
        } as any);

        return successResponse(data, 'Access rule updated successfully');
    } catch (error: any) {
        return errorResponse(null, error.message);
    }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse(null, 'Unauthorized', 401);
        const scope = await getUserTenantScope(userId);
        if (scope.roleLevel < 5) return errorResponse(null, 'Forbidden: Platform Admin only', 403);
        const { id } = params;

        const url = new URL(req.url);
        const reason = url.searchParams.get('reason') || 'Revocation of access rule';

        const { data: oldData } = await app_auth.menuPermissions().select('*').eq('id', id).single();
        if (!oldData) return errorResponse(null, 'Access rule not found', 404);

        // Soft delete
        const { error } = await app_auth.menuPermissions().update({ is_active: false }).eq('id', id);
        if (error) throw new Error(error.message);

        await AuditService.logAction({
            userId,
            action: 'DELETE',
            tableName: 'menu_permissions',
            recordId: id,
            oldData,
            newData: { delete_reason: reason, is_active: false },
            ipAddress: AuditService.getIP(req)
        } as any);

        return successResponse(null, 'Access rule archived');
    } catch (error: any) {
        return errorResponse(null, error.message);
    }
}
