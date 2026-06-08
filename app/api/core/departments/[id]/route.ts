/**
 * CORE API - Department Operations (Individual)
 * Route: /api/core/departments/[id]
 */

import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/errorHandler';
import { core } from '@/lib/supabase';
import { getUserTenantScope } from '@/middleware/tenantFilter';
import { getUserIdFromToken } from '@/lib/jwt';
import { AuditService } from '@/lib/services/AuditService';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse('UNAUTHORIZED', 'Unauthorized', 401);
        const scope = await getUserTenantScope(userId);
        const { id } = params;

        const { data: oldData } = await core.departments().select('*').eq('id', id).single();
        if (!oldData) return errorResponse('NOT_FOUND', 'Department not found', 404);

        if (scope.roleLevel < 4 && (scope.companyId !== (oldData as any).company_id)) {
            return errorResponse('FORBIDDEN', 'Permission Denied', 403);
        }

        const updates = await req.json();
        delete updates.company_id;

        const { data, error } = await core.departments()
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) throw new Error(error.message);

        await AuditService.logAction({
            userId,
            action: 'UPDATE',
            tableName: 'departments',
            schemaName: 'core',
            recordId: id,
            oldData,
            newData: data,
            companyId: (oldData as any).company_id,
            ipAddress: AuditService.getIP(req),
            userAgent: req.headers.get('user-agent') || 'unknown'
        });

        return successResponse(data, 'Department updated');
    } catch (error: any) {
        return errorResponse('INTERNAL_ERROR', error.message, 500);
    }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse('UNAUTHORIZED', 'Unauthorized', 401);
        const scope = await getUserTenantScope(userId);
        const { id } = params;

        const url = new URL(req.url);
        const reason = url.searchParams.get('reason') || 'Administrative archival';

        const { data: oldData } = await core.departments().select('*').eq('id', id).single();
        if (!oldData) return errorResponse('NOT_FOUND', 'Department not found', 404);

        if (scope.roleLevel < 4 && (scope.companyId !== (oldData as any).company_id)) {
            return errorResponse('FORBIDDEN', 'Permission Denied', 403);
        }

        const { error } = await core.departments()
            .update({
                is_active: false,
                deleted_at: new Date().toISOString(),
                deleted_by: userId,
                delete_reason: reason
            })
            .eq('id', id);

        if (error) throw new Error(error.message);

        await AuditService.logAction({
            userId,
            action: 'DELETE',
            tableName: 'departments',
            schemaName: 'core',
            recordId: id,
            oldData,
            newData: { delete_reason: reason, is_active: false, deleted_at: new Date().toISOString() },
            companyId: (oldData as any).company_id,
            ipAddress: AuditService.getIP(req),
            userAgent: req.headers.get('user-agent') || 'unknown'
        });

        return successResponse(null, 'Department archived');
    } catch (error: any) {
        return errorResponse('INTERNAL_ERROR', error.message, 500);
    }
}
