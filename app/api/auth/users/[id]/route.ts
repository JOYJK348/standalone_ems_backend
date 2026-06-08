/**
 * AUTH API - User Operations (Individual)
 * Route: /api/auth/users/[id]
 */

import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/errorHandler';
import { app_auth } from '@/lib/supabase';
import { getUserTenantScope } from '@/middleware/tenantFilter';
import { getUserIdFromToken } from '@/lib/jwt';
import { AuditService } from '@/lib/services/AuditService';
import bcrypt from 'bcryptjs';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse(null, 'Unauthorized', 401);
        const scope = await getUserTenantScope(userId);
        const { id } = params;

        // Fetch user basic data
        const { data: oldUser } = await app_auth.users().select('*').eq('id', id).single();
        if (!oldUser) return errorResponse(null, 'User not found', 404);

        // Permission check: Platform Admin or Company Admin (if same company)
        // Note: For cross-tenant company admins, we need to check if that user belongs to their company
        const { data: userRoleMap } = await app_auth.userRoles().select('company_id').eq('user_id', id).single();

        if (scope.roleLevel < 5) {
            if (scope.roleLevel < 4 || (userRoleMap && (userRoleMap as any).company_id !== scope.companyId)) {
                return errorResponse(null, 'Forbidden', 403);
            }
        }

        const updates = await req.json();

        // Remove sensitive or Immutable fields
        delete updates.id;
        if (updates.password) {
            updates.password_hash = await bcrypt.hash(updates.password, 10);
            delete updates.password;
        }

        const { data, error } = await app_auth.users()
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) throw new Error(error.message);

        await AuditService.logAction({
            userId,
            action: 'UPDATE',
            tableName: 'users',
            recordId: id,
            oldData: oldUser,
            newData: data,
            companyId: (userRoleMap as any)?.company_id || null, // Best effort company mapping
            ipAddress: AuditService.getIP(req)
        } as any);

        return successResponse(data, 'Identity recalibrated');

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
        const reason = url.searchParams.get('reason') || 'Administrative identity lock';

        // Same permission check
        const { data: oldUser } = await app_auth.users().select('*').eq('id', id).single();
        if (!oldUser) return errorResponse(null, 'User not found', 404);

        const { data: userRoleMap } = await app_auth.userRoles().select('company_id').eq('user_id', id).single();
        if (scope.roleLevel < 5) {
            if (scope.roleLevel < 4 || (userRoleMap && (userRoleMap as any).company_id !== scope.companyId)) {
                return errorResponse(null, 'Forbidden', 403);
            }
        }

        console.log('🗑️ Deleting user:', { id, reason, userId, userIdType: typeof userId });

        // Prepare update data with explicit type conversion
        const updateData = {
            is_active: false,
            deleted_at: new Date().toISOString(),
            deleted_by: Number(userId),
            delete_reason: String(reason)
        };

        console.log('📦 Update data for user deletion:', JSON.stringify(updateData, null, 2));

        // Soft delete with proper columns
        const { data: updatedUser, error } = await app_auth.users()
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('❌ User update error:', error);
            throw new Error(error.message);
        }

        console.log('✅ User soft deleted. Updated data:', JSON.stringify(updatedUser, null, 2));

        await AuditService.logAction({
            userId,
            action: 'DELETE',
            tableName: 'users',
            schemaName: 'app_auth',
            recordId: id,
            oldData: oldUser,
            newData: {
                delete_reason: reason,
                is_active: false,
                deleted_at: new Date().toISOString(),
                deleted_by: userId
            },
            companyId: (userRoleMap as any)?.company_id || null,
            ipAddress: AuditService.getIP(req),
            userAgent: req.headers.get('user-agent') || 'unknown'
        } as any);

        console.log('✅ Audit log created for user deletion');

        return successResponse(updatedUser, 'User archived successfully');

    } catch (error: any) {
        console.error('❌ User DELETE error:', error);
        return errorResponse(null, error.message);
    }
}

