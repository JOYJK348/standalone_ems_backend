import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/errorHandler';
import { getUserTenantScope } from '@/middleware/tenantFilter';
import { getUserIdFromToken } from '@/lib/jwt';
import { QuizService } from '@/lib/services/QuizService';
import { ems } from '@/lib/supabase';
import { requireMenuAccessAppRouter } from '@/lib/menuAccessAppRouter';

export async function GET(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse(null, 'Unauthorized', 401);
        const menuAccess = await requireMenuAccessAppRouter(req, 'ems.quizzes.attempts');
        if (menuAccess instanceof Response) return menuAccess;

        const scope = await getUserTenantScope(userId);
        const quizId = parseInt(params.id);

        let studentIds: number[] | undefined = undefined;

        // If user is a tutor, only show results for their students in their courses
        if (scope.emsProfile?.profileType === 'tutor' && scope.emsProfile.profileId) {
            // Get tutor's assigned courses
            const { data: junctionMappings } = await ems.courseTutors()
                .select('course_id')
                .eq('tutor_id', scope.emsProfile.profileId)
                .is('deleted_at', null);

            const { data: legacyCourses } = await ems.courses()
                .select('id')
                .eq('tutor_id', scope.emsProfile.profileId)
                .is('deleted_at', null);

            const tutorCourseIds = [
                ...(junctionMappings?.map((m: any) => m.course_id) || []),
                ...(legacyCourses?.map((c: any) => c.id) || [])
            ];

            if (tutorCourseIds.length > 0) {
                // Get students enrolled in these courses
                const { data: enrollments } = await ems.enrollments()
                    .select('student_id')
                    .in('course_id', tutorCourseIds)
                    .is('deleted_at', null);

                studentIds = enrollments?.map(e => e.student_id) || [];
            } else {
                studentIds = [];
            }
        }

        const data = await QuizService.getQuizAttempts(quizId, scope.companyId!, studentIds);

        return successResponse(data, 'Quiz attempts fetched successfully');
    } catch (error: any) {
        return errorResponse(null, error.message || 'Failed to fetch quiz attempts');
    }
}
