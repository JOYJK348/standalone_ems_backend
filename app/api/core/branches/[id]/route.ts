/**
 * CORE API - Branch Operations (Individual)
 * Route: /api/core/branches/[id]
 */

import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/errorHandler';
import { core, app_auth } from '@/lib/supabase';
import { getUserTenantScope } from '@/middleware/tenantFilter';
import { getUserIdFromToken } from '@/lib/jwt';
import { AuditService } from '@/lib/services/AuditService';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse('UNAUTHORIZED', 'Unauthorized', 401);

        const scope = await getUserTenantScope(userId);
        const { id } = params;

        const { data: branch, error } = await core.branches()
            .select('*, companies:company_id (id, name)')
            .eq('id', id)
            .single();

        if (error || !branch) return errorResponse('NOT_FOUND', 'Branch not found', 404);

        // Fetch deletion metadata if archived
        let deletionInfo = null;
        if ((branch as any).deleted_by) {
            const { data: userData } = await app_auth.users()
                .select('first_name, last_name, email')
                .eq('id', (branch as any).deleted_by)
                .single();

            if (userData) {
                deletionInfo = {
                    deleted_by_name: `${(userData as any).first_name} ${(userData as any).last_name}`,
                    deleted_by_email: (userData as any).email,
                    deleted_at: (branch as any).deleted_at,
                    delete_reason: (branch as any).delete_reason
                };
            }
        }

        // Permission Check: Tenant isolation
        if (scope.roleLevel < 5 && (scope.companyId !== (branch as any).company_id)) {
            return errorResponse('FORBIDDEN', 'Permission Denied', 403);
        }

        // Fetch Branch Admin Permissions
        // Logic: Find users with role 'BRANCH_ADMIN' assigned to this branch via user_roles
        let adminPermissions: string[] = [];

        // 1. Get Role ID for BRANCH_ADMIN (Level 1)
        const { data: roleData } = await app_auth.roles()
            .select('id')
            .eq('name', 'BRANCH_ADMIN')
            .single();

        if (roleData) {
            // 2. Find User ID from user_roles
            const { data: userRoles } = await app_auth.userRoles()
                .select('user_id')
                .eq('branch_id', id)
                .eq('role_id', roleData.id)
                .limit(1);

            if (userRoles && userRoles.length > 0) {
                const adminId = userRoles[0].user_id;

                // 3. Get Permissions
                const { data: userPerms } = await app_auth.userPermissions()
                    .select('permission_id')
                    .eq('user_id', adminId);

                if (userPerms && userPerms.length > 0) {
                    const pIds = userPerms.map((up: any) => up.permission_id);
                    const { data: permNames } = await app_auth.permissions()
                        .select('name')
                        .in('id', pIds);

                    if (permNames) {
                        adminPermissions = permNames.map((p: any) => p.name);
                    }
                }
            }
        }

        return successResponse({
            ...branch,
            admin_permissions: adminPermissions,
            deletion_info: deletionInfo
        }, 'Branch details fetched');

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

        // Fetch branch to check ownership
        const { data: branch, error: fetchError } = await core.branches()
            .select('*')
            .eq('id', id)
            .single();

        if (fetchError || !branch) return errorResponse('NOT_FOUND', 'Branch not found', 404);

        // Permission Check: Target Company Admin or Platform Admin
        if (scope.roleLevel < 5 && (scope.companyId !== (branch as any).company_id)) {
            return errorResponse('FORBIDDEN', 'Permission Denied', 403);
        }

        const body = await req.json();
        const { admin_permissions, ...updates } = body;

        // Remove strictly read-only or sensitive fields if any slipped in
        delete updates.company_id;
        delete updates.id;

        // 1. Update Branch Details
        const { data, error } = await core.branches()
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) throw new Error(error.message);

        // 2. Handle Permission Updates (if provided)
        if (admin_permissions && Array.isArray(admin_permissions)) {
            // Logic: Find users with role 'BRANCH_ADMIN' assigned to this branch via user_roles

            // 1. Get Role ID for BRANCH_ADMIN
            const { data: roleData } = await app_auth.roles()
                .select('id')
                .eq('name', 'BRANCH_ADMIN')
                .single();

            if (roleData) {
                // 2. Find target users (Admins only)
                const { data: targetUserRoles } = await app_auth.userRoles()
                    .select('user_id')
                    .eq('branch_id', id)
                    .eq('role_id', roleData.id);

                if (targetUserRoles && targetUserRoles.length > 0) {
                    // Get Permission IDs for the requested slugs (keys) from DB
                    const { data: permRecords } = await app_auth.permissions()
                        .select('id, name')
                        .in('name', admin_permissions);

                    // We verify permRecords is not undefined. Even empty list is valid (removing all).
                    const permIds = permRecords ? permRecords.map((p: any) => p.id) : [];

                    for (const ur of targetUserRoles) {
                        const targetUserId = ur.user_id;

                        // Clear existing granular permissions for this user
                        await app_auth.userPermissions()
                            .delete()
                            .eq('user_id', targetUserId);

                        if (permIds.length > 0) {
                            const newRecords = permIds.map((pId: string) => ({
                                user_id: targetUserId,
                                permission_id: pId
                            }));

                            await app_auth.userPermissions()
                                .insert(newRecords);
                        }

                        // Log this specific sub-action
                        await AuditService.logAction({
                            userId,
                            action: 'UPDATE_RIGHTS',
                            tableName: 'user_permissions',
                            schemaName: 'app_auth',
                            recordId: targetUserId,
                            oldData: null,
                            newData: { permissions: admin_permissions },
                            companyId: (branch as any).company_id
                        });
                    }
                }
            }
        }

        // Audit Log for Branch Update
        await AuditService.logAction({
            userId,
            action: 'UPDATE',
            tableName: 'branches',
            schemaName: 'core',
            recordId: id,
            oldData: branch,
            newData: data,
            companyId: (branch as any).company_id,
            ipAddress: AuditService.getIP(req),
            userAgent: req.headers.get('user-agent') || 'unknown'
        });

        return successResponse(data, 'Branch and access rights updated successfully');

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

        // Reason might be passed in query or body
        const url = new URL(req.url);
        const reason = url.searchParams.get('reason') || 'Administrative removal';

        // Check ownership
        const { data: branch } = await core.branches()
            .select('*')
            .eq('id', id)
            .single();

        if (!branch) return errorResponse('NOT_FOUND', 'Branch not found', 404);

        if (scope.roleLevel < 5 && (scope.companyId !== (branch as any).company_id)) {
            return errorResponse('FORBIDDEN', 'Permission Denied', 403);
        }

        // Soft Delete with full metadata
        const { error } = await core.branches()
            .update({
                is_active: false,
                deleted_at: new Date().toISOString(),
                deleted_by: userId,
                delete_reason: reason
            })
            .eq('id', id);

        if (error) throw new Error(error.message);

        // Audit Log with Reason
        await AuditService.logAction({
            userId,
            action: 'DELETE',
            tableName: 'branches',
            schemaName: 'core',
            recordId: id,
            oldData: branch,
            newData: { delete_reason: reason, is_active: false, deleted_at: new Date().toISOString() },
            companyId: (branch as any).company_id,
            ipAddress: AuditService.getIP(req),
            userAgent: req.headers.get('user-agent') || 'unknown'
        });

        return successResponse(null, 'Branch archived successfully');

    } catch (error: any) {
        return errorResponse('INTERNAL_ERROR', error.message, 500);
    }
}
