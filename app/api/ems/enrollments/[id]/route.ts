import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/errorHandler';
import { getUserTenantScope } from '@/middleware/tenantFilter';
import { getUserIdFromToken } from '@/lib/jwt';
import { EnrollmentService } from '@/lib/services/EnrollmentService';
import { requireMenuAccessAppRouter } from '@/lib/menuAccessAppRouter';

export async function GET(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse(null, 'Unauthorized', 401);
        const menuAccess = await requireMenuAccessAppRouter(req, 'ems.enrollments.edit');
        if (menuAccess instanceof Response) return menuAccess;

        const scope = await getUserTenantScope(userId);
        const enrollmentId = parseInt(params.id);

        const enrollment = await EnrollmentService.getEnrollmentById(enrollmentId, scope.companyId!);

        if (!enrollment) {
            return errorResponse(null, 'Enrollment not found', 404);
        }

        return successResponse(enrollment, 'Enrollment fetched successfully');

    } catch (error: any) {
        return errorResponse(null, error.message || 'Failed to fetch enrollment');
    }
}

export async function PUT(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse(null, 'Unauthorized', 401);
        const menuAccess = await requireMenuAccessAppRouter(req, 'ems.enrollments.edit');
        if (menuAccess instanceof Response) return menuAccess;

        const scope = await getUserTenantScope(userId);
        const enrollmentId = parseInt(params.id);
        const data = await req.json();

        const updated = await EnrollmentService.updateEnrollment(
            enrollmentId,
            scope.companyId!,
            data
        );

        return successResponse(updated, 'Enrollment updated successfully');

    } catch (error: any) {
        return errorResponse(null, error.message || 'Failed to update enrollment');
    }
}

export async function DELETE(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse(null, 'Unauthorized', 401);
        const menuAccess = await requireMenuAccessAppRouter(req, 'ems.enrollments.edit');
        if (menuAccess instanceof Response) return menuAccess;

        const scope = await getUserTenantScope(userId);
        const enrollmentId = parseInt(params.id);

        const deleted = await EnrollmentService.deleteEnrollment(enrollmentId, scope.companyId!, userId);

        return successResponse({ id: enrollmentId, deleted: true }, 'Enrollment cancelled successfully');

    } catch (error: any) {
        return errorResponse(null, error.message || 'Failed to cancel enrollment');
    }
}
