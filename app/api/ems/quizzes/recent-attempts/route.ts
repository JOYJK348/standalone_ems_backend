import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/errorHandler';
import { getUserTenantScope } from '@/middleware/tenantFilter';
import { getUserIdFromToken } from '@/lib/jwt';
import { ems } from '@/lib/supabase';
import { requireMenuAccessAppRouter } from '@/lib/menuAccessAppRouter';

export async function GET(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse(null, 'Unauthorized', 401);
        const menuAccess = await requireMenuAccessAppRouter(req, 'ems.quizzes.attempts.recent');
        if (menuAccess instanceof Response) return menuAccess;

        const scope = await getUserTenantScope(userId);

        let query = ems.quizAttempts()
            .select(`
                *,
                students:student_id (id, first_name, last_name, student_code),
                quizzes:quiz_id (id, quiz_title)
            `)
            .eq('company_id', scope.companyId!)
            .order('completed_at', { ascending: false })
            .limit(10);

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
                query = query.in('quizzes.course_id', tutorCourseIds);

                // Note: Supabase/PostgREST might have trouble filtering by join column if not properly configured.
                // Alternative: filter by student_ids if enrollments are known.
                const { data: enrollments } = await ems.enrollments()
                    .select('student_id')
                    .in('course_id', tutorCourseIds)
                    .is('deleted_at', null);

                const studentIds = enrollments?.map(e => e.student_id) || [];
                query = query.in('student_id', studentIds);
            } else {
                return successResponse([], 'No results found for tutor');
            }
        }

        const { data, error } = await query;

        if (error) throw error;
        return successResponse(data, 'Recent quiz attempts fetched successfully');
    } catch (error: any) {
        return errorResponse(null, error.message || 'Failed to fetch recent attempts');
    }
}
