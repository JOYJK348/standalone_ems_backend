import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/errorHandler';
import { getUserIdFromToken } from '@/lib/jwt';
import { app_auth } from '@/lib/supabase';
import { ApprovalService } from '@/lib/services/ApprovalService';
import { requireMenuAccessAppRouter } from '@/lib/menuAccessAppRouter';

/**
 * EMS Approvals API - GET Pending items, POST Approve/Reject
 * FIXED: BULLETPROOF Authorization for Production
 */

async function checkAuthorization(userId: number) {
    try {
        // 1. Fetch User Roles (Direct Query, no joins to avoid PostgREST schema issues)
        const { data: userRoles, error: urError } = await app_auth.userRoles()
            .select('role_id, company_id, branch_id, is_active')
            .eq('user_id', userId);

        if (urError || !userRoles || userRoles.length === 0) {
            return { isAuthorized: false, role: 'NONE', error: urError || 'No roles mapping' };
        }

        const activeUserRoles = userRoles.filter(ur => ur.is_active);
        if (activeUserRoles.length === 0) {
            return { isAuthorized: false, role: 'INACTIVE', error: 'User roles are inactive' };
        }

        // 2. Fetch Role Details separately
        const roleIds = activeUserRoles.map(ur => ur.role_id);
        const { data: roles, error: rError } = await app_auth.roles()
            .select('id, name, level')
            .in('id', roleIds);

        if (rError || !roles || roles.length === 0) {
            return { isAuthorized: false, role: 'MISSING_DETAILS', error: rError || 'Role details not found' };
        }

        // 3. Compile and find highest authority
        const userAccess = activeUserRoles.map(ur => {
            const roleDetail = roles.find(r => r.id === ur.role_id);
            return {
                roleName: roleDetail?.name?.toUpperCase()?.replace(/\s+/g, '_') || 'UNKNOWN',
                level: Number(roleDetail?.level || 0),
                companyId: ur.company_id
            };
        }).sort((a, b) => b.level - a.level);

        const primary = userAccess[0];

        // Broad authorization check
        const isAuthorized =
            primary.roleName === 'ACADEMIC_MANAGER' ||
            primary.roleName === 'COMPANY_ADMIN' ||
            primary.roleName === 'PLATFORM_ADMIN' ||
            primary.roleName === 'BRANCH_ADMIN' ||
            primary.level >= 3;

        return {
            isAuthorized,
            role: primary.roleName,
            level: primary.level,
            companyId: primary.companyId,
            debug: { userAccess, userId }
        };
    } catch (err: any) {
        return { isAuthorized: false, role: 'ERROR', error: err.message };
    }
}

export async function GET(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse('UNAUTHORIZED', 'Unauthorized: Invalid session', 401);

        const menuAccess = await requireMenuAccessAppRouter(req, 'ems.approvals');
        if (menuAccess instanceof Response) return menuAccess;

        const auth = await checkAuthorization(userId);

        const companyIdFromHeader = req.headers.get('x-company-id') || req.headers.get('X-Company-Id');
        const companyId = auth.companyId || (companyIdFromHeader ? Number(companyIdFromHeader) : null);

        if (!auth.isAuthorized) {
            console.error(`[Approvals 403] User ${userId} blocked. Role: ${auth.role}, Level: ${auth.level}`);
            return errorResponse('AUTHORIZATION_ERROR', `Forbidden: ${auth.role} (L${auth.level}) cannot access approvals.`, 403, { auth });
        }

        if (!companyId) {
            return errorResponse('BAD_REQUEST', 'Missing context: Company ID required', 400, { auth });
        }

        const pendingData = await ApprovalService.getPendingItems(companyId);
        return successResponse(pendingData, 'Pending items fetched successfully');

    } catch (error: any) {
        console.error('[Approvals GET Critical]', error);
        return errorResponse('INTERNAL_SERVER_ERROR', error.message || 'Server error', 500);
    }
}

export async function POST(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse('UNAUTHORIZED', 'Unauthorized', 401);

        const menuAccess = await requireMenuAccessAppRouter(req, 'ems.approvals');
        if (menuAccess instanceof Response) return menuAccess;

        const auth = await checkAuthorization(userId);
        const companyIdFromHeader = req.headers.get('x-company-id') || req.headers.get('X-Company-Id');
        const companyId = auth.companyId || (companyIdFromHeader ? Number(companyIdFromHeader) : null);

        if (!auth.isAuthorized) {
            return errorResponse('AUTHORIZATION_ERROR', 'Forbidden: Insufficient permissions', 403, { auth });
        }

        const { type, id, action, reason } = await req.json();

        if (!type || !id || !action || !companyId) {
            return errorResponse('BAD_REQUEST', 'Missing required fields or company context', 400);
        }

        let result;
        if (action === 'APPROVE') {
            result = await ApprovalService.approveItem(type, id, companyId, userId);
        } else if (action === 'REJECT') {
            result = await ApprovalService.rejectItem(type, id, companyId, userId, reason);
        } else {
            return errorResponse('BAD_REQUEST', 'Invalid action', 400);
        }

        return successResponse(result, `Item ${action.toLowerCase()}d successfully`);

    } catch (error: any) {
        console.error('[Approvals POST Critical]', error);
        return errorResponse('INTERNAL_SERVER_ERROR', error.message || 'Server error', 500);
    }
}
