/**
 * AUTH API - User Role Binding Operations (Individual)
 * Route: /api/auth/user-roles/[id]
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
        const { id } = params;

        const { data: oldData } = await app_auth.userRoles().select('*').eq('id', id).single();
        if (!oldData) return errorResponse(null, 'Security binding not found', 404);

        if (scope.roleLevel < 5 && (scope.companyId !== (oldData as any).company_id)) {
            return errorResponse(null, 'Forbidden', 403);
        }

        const updates = await req.json();
        const { data, error } = await app_auth.userRoles()
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) throw new Error(error.message);

        await AuditService.logAction({
            userId,
            action: 'UPDATE',
            tableName: 'user_roles',
            recordId: id,
            oldData,
            newData: data,
            companyId: (oldData as any).company_id,
            ipAddress: AuditService.getIP(req)
        } as any);

        return successResponse(data, 'Security binding recalibrated');
    } catch (error: any) {
        return errorResponse(null, error.message);
    }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse(null, 'Unauthorized', 401);
        const scope = await getUserTenantScope(userId);
        const { id } = params;

        const url = new URL(req.url);
        const reason = url.searchParams.get('reason') || 'Revocation of role binding';

        const { data: oldData } = await app_auth.userRoles().select('*').eq('id', id).single();
        if (!oldData) return errorResponse(null, 'Security binding not found', 404);

        if (scope.roleLevel < 5 && (scope.companyId !== (oldData as any).company_id)) {
            return errorResponse(null, 'Forbidden', 403);
        }

        // Soft delete
        const { error } = await app_auth.userRoles().update({ is_active: false }).eq('id', id);
        if (error) throw new Error(error.message);

        await AuditService.logAction({
            userId,
            action: 'DELETE',
            tableName: 'user_roles',
            recordId: id,
            oldData,
            newData: { delete_reason: reason, is_active: false },
            companyId: (oldData as any).company_id,
            ipAddress: AuditService.getIP(req)
        } as any);

        return successResponse(null, 'Security binding archived');
    } catch (error: any) {
        return errorResponse(null, error.message);
    }
}
