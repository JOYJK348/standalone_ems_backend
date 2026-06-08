import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/errorHandler';
import { getUserIdFromToken } from '@/lib/jwt';
import { getUserTenantScope } from '@/middleware/tenantFilter';
import { requireMenuAccessAppRouter } from '@/lib/menuAccessAppRouter';
import { PracticeService } from '@/lib/services/PracticeService';

export async function POST(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse(null, 'Unauthorized', 401);

        const menuAccess = await requireMenuAccessAppRouter(req, 'ems.practice.reset');
        if (menuAccess instanceof Response) return menuAccess;

        const scope = await getUserTenantScope(userId);
        if (scope.roleLevel < 1) return errorResponse(null, 'Forbidden', 403);

        const { allocationId, newLimit } = await req.json();

        if (!allocationId) return errorResponse(null, 'Missing allocationId', 400);

        const updated = await PracticeService.resetUsageLimit(
            parseInt(allocationId),
            newLimit ? parseInt(newLimit) : 5
        );

        return successResponse(updated, 'Practice limit reset successfully');

    } catch (error: any) {
        return errorResponse(null, error.message || 'Failed to reset practice limit');
    }
}
