/**
 * AUTH API - Role Permissions mapping
 * Route: /api/auth/role-permissions
 */

import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/errorHandler';
import { app_auth } from '@/lib/supabase';
import { getUserTenantScope } from '@/middleware/tenantFilter';
import { getUserIdFromToken } from '@/lib/jwt';
import { AuditService } from '@/lib/services/AuditService';
import { dataCache } from '@/lib/cache/dataCache';

const CACHE_TTL = 5 * 60 * 1000;

export async function GET(req: NextRequest) {
    try {
        const url = new URL(req.url);
        const roleId = url.searchParams.get('roleId');

        const cacheKey = `ems_role_permissions:${roleId || 'all'}`;
        const cached = await dataCache.get(cacheKey);
        if (cached) return successResponse(cached, 'Role permissions fetched (cached)');

        let query = app_auth.rolePermissions()
            .select('*');

        if (roleId && !isNaN(Number(roleId))) {
            query = query.eq('role_id', Number(roleId));
        }

        const { data, error } = await query;
        if (error) throw new Error(error.message);
        await dataCache.set(cacheKey, data || [], CACHE_TTL);
        return successResponse(data || [], 'Role permissions fetched');
    } catch (error: any) {
        return errorResponse(null, error.message);
    }
}

export async function POST(req: NextRequest) {
    try {
        const actingUserId = await getUserIdFromToken(req);
        if (!actingUserId) return errorResponse(null, 'Unauthorized', 401);

        const scope = await getUserTenantScope(actingUserId);

        // 🏗️ MNC SECURITY POLICY:
        // Level 5 (Platform) can manage EVERYTHING.
        // Level 4 (Company) can manage Role Defaults for their system context.
        if (scope.roleLevel < 4) {
            return errorResponse(null, 'Forbidden: Company Admin access required', 403);
        }

        const body = await req.json();
        const { roleId, permissionIds } = body;

        if (!roleId || !Array.isArray(permissionIds)) {
            return errorResponse(null, 'Role ID and Permission IDs (array) are required', 400);
        }

        const rid = parseInt(String(roleId));

        // 1. Delete existing role permissions for this role
        const { error: deleteError } = await app_auth.rolePermissions()
            .delete()
            .eq('role_id', rid);

        if (deleteError) throw new Error(`Delete Error: ${deleteError.message}`);

        // 2. Insert new assignments
        if (permissionIds.length > 0) {
            const inserts = permissionIds.map(pid => ({
                role_id: rid,
                permission_id: parseInt(String(pid)),
                created_by: actingUserId
            }));

            const { error: insertError } = await app_auth.rolePermissions().insert(inserts);
            if (insertError) throw new Error(`Insert Error: ${insertError.message}`);
        }

        try {
            await AuditService.logAction({
                userId: actingUserId,
                action: 'UPDATE',
                tableName: 'role_permissions',
                recordId: String(rid),
                newData: { roleId: rid, permissionIds },
                ipAddress: AuditService.getIP(req)
            } as any);
        } catch (auditErr) {
            console.warn('[ROLE PERMISSIONS] Audit log failed (non-critical):', auditErr);
        }

        return successResponse(null, 'Role permissions synchronized successfully', 200);
    } catch (error: any) {
        console.error('[ROLE PERMISSIONS] Error:', error.message);
        return errorResponse(null, error.message);
    }
}
