/**
 * CORE API - Employee Operations (Individual)
 * Route: /api/core/employees/[id]
 */

import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/errorHandler';
import { core as coreSchema } from '@/lib/supabase';
import { getUserTenantScope } from '@/middleware/tenantFilter';
import { getUserIdFromToken } from '@/lib/jwt';
import { AuditService } from '@/lib/services/AuditService';

// Individual GET
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse('UNAUTHORIZED', 'Unauthorized', 401);

        const scope = await getUserTenantScope(userId);
        const { id } = params;

        const { data: employee, error } = await coreSchema.employees()
            .select('*')
            .eq('id', id)
            .single();

        if (error || !employee) return errorResponse('NOT_FOUND', 'Employee not found', 404);

        // Permission Check: Tenant isolation
        if (scope.roleLevel < 4 && (scope.companyId !== (employee as any).company_id)) {
            return errorResponse('FORBIDDEN', 'Permission Denied', 403);
        }

        return successResponse(employee, 'Employee record fetched');

    } catch (error: any) {
        return errorResponse('INTERNAL_ERROR', error.message, 500);
    }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse('UNAUTHORIZED', 'Unauthorized', 401);

        const scope = await getUserTenantScope(userId);
        const { id } = params;

        const { data: employee } = await coreSchema.employees().select('*').eq('id', id).single();
        if (!employee) return errorResponse('NOT_FOUND', 'Employee not found', 404);

        if (scope.roleLevel < 1 || (scope.roleLevel < 5 && scope.companyId !== (employee as any).company_id)) {
            return errorResponse('FORBIDDEN', 'Permission Denied: Insufficient clearance for modification', 403);
        }

        const updates = await req.json();
        delete updates.company_id;

        const { data, error } = await coreSchema.employees()
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) throw new Error(error.message);

        await AuditService.logAction({
            userId,
            action: 'UPDATE',
            tableName: 'employees',
            recordId: id,
            oldData: employee,
            newData: data,
            companyId: (employee as any).company_id,
            ipAddress: AuditService.getIP(req)
        } as any);

        return successResponse(data, 'Employee updated successfully');

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
        const reason = url.searchParams.get('reason') || 'Administrative termination';

        console.log('🗑️ Deleting employee:', { id, reason, userId, userIdType: typeof userId });

        const { data: employee } = await coreSchema.employees().select('*').eq('id', id).single();
        if (!employee) return errorResponse('NOT_FOUND', 'Employee not found', 404);

        if (scope.roleLevel < 4 || (scope.roleLevel < 5 && scope.companyId !== (employee as any).company_id)) {
            return errorResponse('FORBIDDEN', 'Permission Denied: Strategic removal requires Company Admin clearance', 403);
        }

        // Prepare update data with explicit type conversion
        const updateData = {
            is_active: false,
            deleted_at: new Date().toISOString(),
            deleted_by: Number(userId),
            delete_reason: String(reason)
        };

        console.log('📦 Update data for employee deletion:', JSON.stringify(updateData, null, 2));

        const { data: updatedEmployee, error } = await coreSchema.employees()
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('❌ Employee update error:', error);
            throw new Error(error.message);
        }

        console.log('✅ Employee soft deleted. Updated data:', JSON.stringify(updatedEmployee, null, 2));

        await AuditService.logAction({
            userId,
            action: 'DELETE',
            tableName: 'employees',
            schemaName: 'core',
            recordId: id,
            oldData: employee,
            newData: {
                delete_reason: reason,
                is_active: false,
                deleted_at: new Date().toISOString(),
                deleted_by: userId
            },
            companyId: (employee as any).company_id,
            ipAddress: AuditService.getIP(req),
            userAgent: req.headers.get('user-agent') || 'unknown'
        });

        console.log('✅ Audit log created for employee deletion');

        return successResponse(updatedEmployee, 'Employee record archived');

    } catch (error: any) {
        console.error('❌ Employee DELETE error:', error);
        return errorResponse('INTERNAL_ERROR', error.message);
    }
}
