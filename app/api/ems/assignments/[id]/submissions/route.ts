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
        console.log(`[API Submissions] Request for ID: ${params.id}`);

        const userId = await getUserIdFromToken(req);
        if (!userId) {
            console.error('[API Submissions] Unauthorized: No userId found');
            return errorResponse('UNAUTHORIZED', 'Unauthorized', 401);
        }
        const menuAccess = await requireMenuAccessAppRouter(req, 'ems.assignments.submissions');
        if (menuAccess instanceof Response) return menuAccess;

        const scope = await getUserTenantScope(userId);
        if (!scope.companyId) {
            console.error('[API Submissions] Forbidden: No company scope for user', userId);
            return errorResponse('FORBIDDEN', 'No company scope found for your account', 403);
        }

        const assignmentId = parseInt(params.id);
        if (isNaN(assignmentId)) {
            console.error('[API Submissions] Invalid ID:', params.id);
            return errorResponse('INVALID_ID', 'Invalid assignment ID provided', 400);
        }

        console.log(`[API Submissions] User: ${userId}, Company: ${scope.companyId}, ID: ${assignmentId}`);

        const result = await AssignmentService.getAssignmentSubmissions(assignmentId, scope.companyId);

        if (!result || !result.assignment) {
            console.error('[API Submissions] Assignment not found in Service for ID:', assignmentId);
            return errorResponse('NOT_FOUND', 'Assignment not found or access denied', 404);
        }

        return successResponse(result, 'Assignment submissions fetched successfully');
    } catch (error: any) {
        console.error(`[API Submissions] CRITICAL ERROR:`, error);
        return errorResponse('SERVER_ERROR', error.message || 'Internal server error', 500);
    }
}
