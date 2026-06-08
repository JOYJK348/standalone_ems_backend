/**
 * CORE API - Country Operations (Individual)
 * Route: /api/core/countries/[id]
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
        if (scope.roleLevel < 5) return errorResponse(null, 'Forbidden: Platform Admin only', 403);
        const { id } = params;

        const { data: oldData } = await core.countries().select('*').eq('id', id).single();
        if (!oldData) return errorResponse(null, 'Country not found', 404);

        const updates = await req.json();
        const { data, error } = await core.countries().update(updates).eq('id', id).select().single();
        if (error) throw new Error(error.message);

        await AuditService.logAction({
            userId,
            action: 'UPDATE',
            tableName: 'countries',
            recordId: id,
            oldData,
            newData: data,
            ipAddress: AuditService.getIP(req)
        } as any);

        return successResponse(data, 'Country updated');
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
        const reason = url.searchParams.get('reason') || 'Administrative archival';

        const { data: oldData } = await core.countries().select('*').eq('id', id).single();
        if (!oldData) return errorResponse(null, 'Country not found', 404);

        const { error } = await core.countries().update({ is_active: false }).eq('id', id);
        if (error) throw new Error(error.message);

        await AuditService.logAction({
            userId,
            action: 'DELETE',
            tableName: 'countries',
            recordId: id,
            oldData,
            newData: { delete_reason: reason, is_active: false },
            ipAddress: AuditService.getIP(req)
        } as any);

        return successResponse(null, 'Country archived');
    } catch (error: any) {
        return errorResponse(null, error.message);
    }
}
