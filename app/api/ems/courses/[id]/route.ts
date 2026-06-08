import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/errorHandler';
import { getUserTenantScope } from '@/middleware/tenantFilter';
import { getUserIdFromToken } from '@/lib/jwt';
import { courseSchema } from '@/lib/validations/ems';
import { CourseService } from '@/lib/services/CourseService';
import { ems } from '@/lib/supabase';
import { requireMenuAccessAppRouter } from '@/lib/menuAccessAppRouter';

export async function GET(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse(null, 'Unauthorized', 401);

        // Students only need 'ems.courses' (view), editors need 'ems.courses.edit'
        let menuAccess = await requireMenuAccessAppRouter(req, 'ems.courses.edit');
        if (menuAccess instanceof Response) {
            menuAccess = await requireMenuAccessAppRouter(req, 'ems.courses');
            if (menuAccess instanceof Response) return menuAccess;
        }

        const scope = await getUserTenantScope(userId);
        const courseId = parseInt(params.id);

        let course = await CourseService.getCourseDetails(
            courseId,
            scope.companyId!,
            scope.emsProfile
        );

        if (!course) {
            return errorResponse(null, 'Course not found', 404);
        }

        const { searchParams } = new URL(req.url);
        const includeActiveSession = searchParams.get('include_active_session') === 'true';

        if (includeActiveSession && scope.emsProfile?.profileType === 'student') {
            // Find student's enrollment for this course to get batch_id
            const { data: enrollment } = await ems.enrollments()
                .select('batch_id')
                .eq('student_id', scope.emsProfile.profileId!)
                .eq('course_id', courseId)
                .is('deleted_at', null)
                .single() as any;

            if (enrollment?.batch_id) {
                const today = new Date().toISOString().split('T')[0];
                const now = new Date().toISOString();

                // Find active session for today and batch
                const { data: session } = await ems.attendanceSessions()
                    .select('*')
                    .eq('batch_id', enrollment.batch_id)
                    .eq('session_date', today)
                    .in('status', ['OPEN', 'SCHEDULED']) as any;

                // Handle both single object and array return if any
                const activeSession = Array.isArray(session) ? session[0] : session;

                if (activeSession) {
                    (course as any).active_session = activeSession;
                }
            }
        }

        return successResponse(course, 'Course fetched successfully');

    } catch (error: any) {
        return errorResponse(null, error.message || 'Failed to fetch course');
    }
}

export async function PUT(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse(null, 'Unauthorized', 401);

        const menuAccess = await requireMenuAccessAppRouter(req, 'ems.courses.edit');
        if (menuAccess instanceof Response) return menuAccess;

        const scope = await getUserTenantScope(userId);
        const courseId = parseInt(params.id);
        const data = await req.json();

        const validatedData = courseSchema.partial().parse(data);

        const updatedCourse = await CourseService.updateCourse(
            courseId,
            scope.companyId!,
            validatedData
        );

        if (!updatedCourse) {
            return errorResponse(null, 'Course not found or update failed', 404);
        }

        return successResponse(updatedCourse, 'Course updated successfully');

    } catch (error: any) {
        if (error.name === 'ZodError') {
            return errorResponse(error.errors, 'Validation failed', 400);
        }
        return errorResponse(null, error.message || 'Failed to update course');
    }
}

export async function PATCH(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    return PUT(req, { params });
}

export async function DELETE(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse(null, 'Unauthorized', 401);

        const menuAccess = await requireMenuAccessAppRouter(req, 'ems.courses.edit');
        if (menuAccess instanceof Response) return menuAccess;

        const scope = await getUserTenantScope(userId);
        const courseId = parseInt(params.id);

        // Get delete reason from request body
        const body = await req.json();
        const deleteReason = body?.deleteReason?.trim();

        if (!deleteReason) {
            return errorResponse(null, 'Delete reason is required', 400);
        }

        if (deleteReason.length < 10) {
            return errorResponse(null, 'Delete reason must be at least 10 characters', 400);
        }

        const deleted = await CourseService.deleteCourse(
            courseId,
            scope.companyId!,
            userId,
            deleteReason
        );

        if (!deleted) {
            return errorResponse(null, 'Course not found or already deleted', 404);
        }

        return successResponse(
            { id: courseId, deleted: true },
            'Course deleted successfully'
        );

    } catch (error: any) {
        return errorResponse(null, error.message || 'Failed to delete course');
    }
}
