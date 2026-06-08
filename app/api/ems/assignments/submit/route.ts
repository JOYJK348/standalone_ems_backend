import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/errorHandler';
import { getUserTenantScope, autoAssignCompany } from '@/middleware/tenantFilter';
import { getUserIdFromToken } from '@/lib/jwt';
import { AssignmentService } from '@/lib/services/AssignmentService';
import { requireMenuAccessAppRouter } from '@/lib/menuAccessAppRouter';

export async function POST(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse(null, 'Unauthorized', 401);
        const menuAccess = await requireMenuAccessAppRouter(req, 'ems.assignments.submit');
        if (menuAccess instanceof Response) return menuAccess;

        let data = await req.json();

        // Ensure student ID is correct if student is submitting
        const scope = await getUserTenantScope(userId);
        if (scope.emsProfile?.profileType === 'student') {
            data.student_id = scope.emsProfile.profileId;
            data.submission_status = 'SUBMITTED';
            data.submitted_at = new Date().toISOString();
        }

        data = await autoAssignCompany(userId, data);
        const submission = await AssignmentService.submitAssignment(data);

        return successResponse(submission, 'Assignment submitted successfully');
    } catch (error: any) {
        console.error('Submission Error:', error);
        return errorResponse(null, error.message || 'Failed to submit assignment');
    }
}
