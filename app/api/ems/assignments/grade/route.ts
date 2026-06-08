import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/errorHandler';
import { getUserTenantScope } from '@/middleware/tenantFilter';
import { getUserIdFromToken } from '@/lib/jwt';
import { AssignmentService } from '@/lib/services/AssignmentService';
import { requireMenuAccessAppRouter } from '@/lib/menuAccessAppRouter';

export async function POST(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse(null, 'Unauthorized', 401);
        const menuAccess = await requireMenuAccessAppRouter(req, 'ems.assignments.grade');
        if (menuAccess instanceof Response) return menuAccess;

        const scope = await getUserTenantScope(userId);
        if (scope.emsProfile?.profileType !== 'tutor' && scope.roleLevel > 2) {
            return errorResponse(null, 'Only tutors or admins can grade assignments', 403);
        }

        const { submissionId, ...gradingData } = await req.json();

        if (!submissionId) return errorResponse(null, 'Submission ID is required');

        // Add grader ID
        gradingData.graded_by = scope.emsProfile?.profileId || userId;
        gradingData.submission_status = 'GRADED';

        const result = await AssignmentService.gradeSubmission(
            submissionId,
            scope.companyId!,
            gradingData
        );

        return successResponse(result, 'Assignment graded successfully');
    } catch (error: any) {
        console.error('Grading Error:', error);
        return errorResponse(null, error.message || 'Failed to grade assignment');
    }
}
