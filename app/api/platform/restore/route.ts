/**
 * PLATFORM API - Restore Archived Item
 * Route: /api/platform/restore
 */

import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/errorHandler';
import { app_auth, core } from '@/lib/supabase';
import { getUserIdFromToken } from '@/lib/jwt';
import { getUserTenantScope } from '@/middleware/tenantFilter';
import { AuditService } from '@/lib/services/AuditService';

export async function POST(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse('UNAUTHORIZED', 'Unauthorized', 401);

        const scope = await getUserTenantScope(userId);
        if (scope.roleLevel < 5) return errorResponse('FORBIDDEN', 'Forbidden: Platform Admin only', 403);

        const body = await req.json();
        const { type, id } = body;

        if (!type || !id) return errorResponse('BAD_REQUEST', 'Missing type or id', 400);

        let result;
        let table = '';
        let schema = '';

        const restoreData = {
            is_active: true,
            deleted_at: null,
            deleted_by: null,
            delete_reason: null
        };

        if (type === 'users') {
            table = 'users'; // for audit
            schema = 'app_auth';
            const { data, error } = await app_auth.users()
                .update(restoreData)
                .eq('id', id)
                .select()
                .single();
            if (error) throw new Error(error.message);
            result = data;
        } else if (type === 'employees') {
            table = 'employees';
            schema = 'core';
            const { data, error } = await core.employees()
                .update(restoreData)
                .eq('id', id)
                .select()
                .single();
            if (error) throw new Error(error.message);
            result = data;
        } else if (type === 'companies') {
            table = 'companies';
            schema = 'core';
            const { data, error } = await core.companies()
                .update(restoreData)
                .eq('id', id)
                .select()
                .single();
            if (error) throw new Error(error.message);
            result = data;
        } else {
            return errorResponse('BAD_REQUEST', 'Invalid type', 400);
        }

        await AuditService.logAction({
            userId,
            action: 'RESTORE',
            tableName: table,
            schemaName: schema,
            recordId: id,
            oldData: { is_active: false, deleted_at: 'NOT NULL' },
            newData: { is_active: true, deleted_at: null },
            companyId: scope.companyId,
            ipAddress: AuditService.getIP(req),
            userAgent: req.headers.get('user-agent') || 'unknown'
        } as any);

        return successResponse(result, 'Item restored successfully');

    } catch (error: any) {
        return errorResponse('INTERNAL_ERROR', error.message);
    }
}
