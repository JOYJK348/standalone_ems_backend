import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/errorHandler';
import { getUserTenantScope } from '@/middleware/tenantFilter';
import { getUserIdFromToken } from '@/lib/jwt';
import { AssignmentService } from '@/lib/services/AssignmentService';
import { requireMenuAccessAppRouter } from '@/lib/menuAccessAppRouter';
import { dataCache } from '@/lib/cache/dataCache';

const CACHE_TTL = 60 * 1000;

export async function GET(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse(null, 'Unauthorized', 401);
        const menuAccess = await requireMenuAccessAppRouter(req, 'ems.assignments.edit');
        if (menuAccess instanceof Response) return menuAccess;

        const scope = await getUserTenantScope(userId);
        const assignmentId = parseInt(params.id);

        const cacheKey = `ems_assignment:${assignmentId}:${scope.companyId}`;
        const cached = await dataCache.get(cacheKey);
        if (cached) return successResponse(cached, 'Assignment fetched successfully (cached)');

        const assignment = await AssignmentService.getAssignmentDetails(assignmentId, scope.companyId!);

        await dataCache.set(cacheKey, assignment, CACHE_TTL);
        return successResponse(assignment, 'Assignment fetched successfully');
    } catch (error: any) {
        return errorResponse(null, error.message || 'Failed to fetch assignment');
    }
}

export async function PUT(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse(null, 'Unauthorized', 401);
        const menuAccess = await requireMenuAccessAppRouter(req, 'ems.assignments.edit');
        if (menuAccess instanceof Response) return menuAccess;

        const scope = await getUserTenantScope(userId);
        const assignmentId = parseInt(params.id);
        const data = await req.json();

        const updated = await AssignmentService.updateAssignment(assignmentId, scope.companyId!, data);

        return successResponse(updated, 'Assignment updated successfully');
    } catch (error: any) {
        return errorResponse(null, error.message || 'Failed to update assignment');
    }
}

export async function DELETE(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse(null, 'Unauthorized', 401);
        const menuAccess = await requireMenuAccessAppRouter(req, 'ems.assignments.edit');
        if (menuAccess instanceof Response) return menuAccess;

        const scope = await getUserTenantScope(userId);
        const assignmentId = parseInt(params.id);

        await AssignmentService.deleteAssignment(assignmentId, scope.companyId!, userId);

        return successResponse({ id: assignmentId, deleted: true }, 'Assignment deleted successfully');
    } catch (error: any) {
        return errorResponse(null, error.message || 'Failed to delete assignment');
    }
}
