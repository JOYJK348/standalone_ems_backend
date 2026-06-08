import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/errorHandler';
import { getUserIdFromToken } from '@/lib/jwt';
import { getUserTenantScope } from '@/middleware/tenantFilter';
import { requireMenuAccessAppRouter } from '@/lib/menuAccessAppRouter';
import { PracticeService } from '@/lib/services/PracticeService';

/**
 * GET /api/ems/practice/dashboard
 * Fetches practicing license quotas for Academic Manager
 */
export async function GET(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse(null, 'Unauthorized', 401);

        const menuAccess = await requireMenuAccessAppRouter(req, 'ems.practice.dashboard');
        if (menuAccess instanceof Response) return menuAccess;

        const scope = await getUserTenantScope(userId);
        if (scope.roleLevel < 1) return errorResponse(null, 'Forbidden', 403);

        const quotas = await PracticeService.getPracticeQuotas(scope.companyId!);

        return successResponse(quotas, 'Practice quotas fetched successfully');

    } catch (error: any) {
        return errorResponse(null, error.message || 'Failed to fetch quotas');
    }
}
