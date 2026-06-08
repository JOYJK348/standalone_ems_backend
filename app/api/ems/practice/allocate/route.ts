import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/errorHandler';
import { getUserIdFromToken } from '@/lib/jwt';
import { getUserTenantScope, autoAssignCompany } from '@/middleware/tenantFilter';
import { requireMenuAccessAppRouter } from '@/lib/menuAccessAppRouter';
import { PracticeService } from '@/lib/services/PracticeService';

/**
 * POST /api/ems/practice/allocate
 * Assigns a practice module to a student
 */
export async function POST(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse(null, 'Unauthorized', 401);

        const menuAccess = await requireMenuAccessAppRouter(req, 'ems.practice.allocate');
        if (menuAccess instanceof Response) return menuAccess;

        const scope = await getUserTenantScope(userId);
        if (scope.roleLevel < 1) return errorResponse(null, 'Forbidden', 403);

        const { studentId, courseId, moduleType } = await req.json();

        if (!studentId || !courseId || !moduleType) {
            return errorResponse(null, 'Missing required fields: studentId, courseId, moduleType', 400);
        }

        const allocation = await PracticeService.allocateModule(
            parseInt(studentId),
            parseInt(courseId),
            moduleType,
            scope.companyId!,
            userId
        );

        return successResponse(allocation, `${moduleType} practice allocated successfully`);

    } catch (error: any) {
        return errorResponse(null, error.message || 'Failed to allocate practice');
    }
}
