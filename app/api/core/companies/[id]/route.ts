/**
 * CORE API - Company Operations (Individual)
 * Route: /api/core/companies/[id]
 */

import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/errorHandler';
import { core } from '@/lib/supabase';
import { getUserTenantScope } from '@/middleware/tenantFilter';
import { getUserIdFromToken } from '@/lib/jwt';
import { AuditService } from '@/lib/services/AuditService';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse('UNAUTHORIZED', 'Unauthorized', 401);

        const scope = await getUserTenantScope(userId);
        const { id } = params;

        if (scope.roleLevel < 5 && (scope.companyId as any)?.toString() !== id) {
            return errorResponse('FORBIDDEN', 'Permission Denied', 403);
        }

        const { data, error } = await core.companies()
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw new Error(error.message);

        // 🛡️ High-Verbosity Audit (Tracks granular view of a specific company)
        await AuditService.logAction({
            userId,
            action: 'VIEW',
            tableName: 'companies',
            schemaName: 'core',
            recordId: id,
            companyId: parseInt(id),
            ipAddress: AuditService.getIP(req),
        });

        return successResponse(data, 'Company details fetched');

    } catch (error: any) {
        return errorResponse('INTERNAL_ERROR', error.message);
    }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse('UNAUTHORIZED', 'Unauthorized', 401);

        const scope = await getUserTenantScope(userId);
        const { id } = params;

        // Fetch old data for audit
        const { data: oldData } = await core.companies().select('*').eq('id', id).single();
        if (!oldData) return errorResponse('NOT_FOUND', 'Company not found', 404);

        if (scope.roleLevel < 4 || (scope.roleLevel < 5 && (scope.companyId as any)?.toString() !== id)) {
            return errorResponse('FORBIDDEN', 'Permission Denied', 403);
        }

        const updates = await req.json();
        if (scope.roleLevel < 5) {
            delete updates.id;
            delete updates.code;
        }

        const { data, error } = await core.companies()
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) throw new Error(error.message);

        await AuditService.logAction({
            userId,
            action: 'UPDATE',
            tableName: 'companies',
            recordId: id,
            oldData,
            newData: data,
            companyId: parseInt(id),
            ipAddress: AuditService.getIP(req)
        } as any);

        return successResponse(data, 'Company updated successfully');

    } catch (error: any) {
        return errorResponse('INTERNAL_ERROR', error.message);
    }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse('UNAUTHORIZED', 'Unauthorized', 401);

        const scope = await getUserTenantScope(userId);
        const { id } = params;

        const url = new URL(req.url);
        const reason = url.searchParams.get('reason') || 'Administrative removal';

        if (scope.roleLevel < 5) {
            return errorResponse('FORBIDDEN', 'Only Platform Admin can archive companies', 403);
        }

        const { data: oldData } = await core.companies().select('*').eq('id', id).single();
        if (!oldData) return errorResponse('NOT_FOUND', 'Company not found', 404);

        console.log('🗑️ Deleting company:', { id, reason, userId, userIdType: typeof userId });

        // Prepare update data with explicit type conversion
        const updateData = {
            is_active: false,
            deleted_at: new Date().toISOString(),
            deleted_by: Number(userId), // Explicit conversion to number
            delete_reason: String(reason) // Explicit conversion to string
        };

        console.log('📦 Update data:', JSON.stringify(updateData, null, 2));

        const { data: updatedData, error } = await core.companies()
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('❌ Company update error:', error);
            throw new Error(error.message);
        }

        console.log('✅ Company marked as deleted. Updated data:', JSON.stringify(updatedData, null, 2));

        const auditLogData = {
            userId,
            action: 'DELETE',
            tableName: 'companies',
            schemaName: 'core',
            recordId: id,
            oldData,
            newData: { delete_reason: reason, is_active: false, deleted_at: new Date().toISOString(), deleted_by: userId },
            companyId: parseInt(id),
            ipAddress: AuditService.getIP(req),
            userAgent: req.headers.get('user-agent') || 'unknown'
        };

        console.log('📝 Audit log data:', JSON.stringify(auditLogData, null, 2));

        await AuditService.logAction(auditLogData);

        console.log('✅ Audit log created successfully');

        return successResponse(updatedData, 'Company archived successfully');

    } catch (error: any) {
        console.error('❌ DELETE error:', error);
        return errorResponse('INTERNAL_ERROR', error.message);
    }
}
