import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/errorHandler';
import { getUserTenantScope } from '@/middleware/tenantFilter';
import { getUserIdFromToken } from '@/lib/jwt';
import { AssignmentService } from '@/lib/services/AssignmentService';
import { requireMenuAccessAppRouter } from '@/lib/menuAccessAppRouter';

export async function GET(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse(null, 'Unauthorized', 401);

        const menuAccess = await requireMenuAccessAppRouter(req, 'ems.students.assignments.view');
        if (menuAccess instanceof Response) return menuAccess;

        const scope = await getUserTenantScope(userId);
        if (!scope.emsProfile?.profileId || scope.emsProfile.profileType !== 'student') {
            return errorResponse(null, 'Student profile not found', 404);
        }

        const assignmentId = parseInt(params.id);
        const data = await AssignmentService.getStudentAssignmentDetail(
            assignmentId,
            scope.emsProfile.profileId,
            scope.companyId!
        );

        return successResponse(data, 'Assignment details fetched successfully');
    } catch (error: any) {
        console.error('Error fetching student assignment:', error);
        return errorResponse(null, error.message || 'Failed to fetch assignment');
    }
}
