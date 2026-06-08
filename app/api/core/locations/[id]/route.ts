/**
 * CORE API - Location Operations (Individual)
 * Route: /api/core/locations/[id]
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
        if (!userId) return errorResponse(null, 'Unauthorized', 401);
        const scope = await getUserTenantScope(userId);
        const { id } = params;

        const { data: oldData } = await core.locations().select('*').eq('id', id).single();
        if (!oldData) return errorResponse(null, 'Location not found', 404);

        if (scope.roleLevel < 4 && (scope.companyId !== (oldData as any).company_id)) {
            return errorResponse(null, 'Permission Denied', 403);
        }

        const updates = await req.json();
        delete updates.company_id;

        const { data, error } = await core.locations()
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) throw new Error(error.message);

        await AuditService.logAction({
            userId,
            action: 'UPDATE',
            tableName: 'locations',
            recordId: id,
            oldData,
            newData: data,
            companyId: (oldData as any).company_id,
            ipAddress: AuditService.getIP(req)
        } as any);

        return successResponse(data, 'Location updated');
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
        const reason = url.searchParams.get('reason') || 'Administrative archival';

        const { data: oldData } = await core.locations().select('*').eq('id', id).single();
        if (!oldData) return errorResponse(null, 'Location not found', 404);

        if (scope.roleLevel < 4 && (scope.companyId !== (oldData as any).company_id)) {
            return errorResponse(null, 'Permission Denied', 403);
        }

        const { error } = await core.locations()
            .update({ is_active: false })
            .eq('id', id);

        if (error) throw new Error(error.message);

        await AuditService.logAction({
            userId,
            action: 'DELETE',
            tableName: 'locations',
            recordId: id,
            oldData,
            newData: { delete_reason: reason, is_active: false },
            companyId: (oldData as any).company_id,
            ipAddress: AuditService.getIP(req)
        } as any);

        return successResponse(null, 'Location archived');
    } catch (error: any) {
        return errorResponse(null, error.message);
    }
}
