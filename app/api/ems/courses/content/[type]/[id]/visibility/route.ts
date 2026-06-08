
import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/errorHandler';
import { getUserTenantScope } from '@/middleware/tenantFilter';
import { CourseService } from '@/lib/services/CourseService';

/**
 * EMS API - Content Visibility Toggle
 * Route: /api/ems/courses/content/[type]/[id]/visibility
 */
export async function PATCH(
    req: NextRequest,
    { params }: { params: { type: string, id: string } }
) {
    try {
        const userIdHeader = req.headers.get('x-user-id');
        const userId = userIdHeader ? parseInt(userIdHeader) : null;
        if (!userId) return errorResponse(null, 'Unauthorized', 401);

        const scope = await getUserTenantScope(userId);
        if (scope.roleLevel < 1) return errorResponse(null, 'Forbidden', 403);

        const { visibility } = await req.json();

        const contentType = params.type as 'module' | 'lesson' | 'material';
        const contentId = parseInt(params.id);

        const result = await CourseService.updateContentVisibility(
            contentType,
            contentId,
            visibility,
            scope.companyId!
        );

        return successResponse(result, `Content visibility updated to ${visibility} successfully`);

    } catch (error: any) {
        return errorResponse(null, error.message || 'Failed to update visibility');
    }
}
