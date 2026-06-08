import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/errorHandler';
import { getUserTenantScope, autoAssignCompany } from '@/middleware/tenantFilter';
import { getUserIdFromToken } from '@/lib/jwt';
import { QuizService } from '@/lib/services/QuizService';
import { ems } from '@/lib/supabase';
import { requireMenuAccessAppRouter } from '@/lib/menuAccessAppRouter';

export async function GET(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse(null, 'Unauthorized', 401);

        const menuAccess = await requireMenuAccessAppRouter(req, 'ems.quizzes');
        if (menuAccess instanceof Response) return menuAccess;

        const scope = await getUserTenantScope(userId);

        let courseIds: number[] | undefined = undefined;
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

            courseIds = [
                ...(junctionMappings?.map((m: any) => m.course_id) || []),
                ...(legacyCourses?.map((c: any) => c.id) || [])
            ];
        } else if (scope.emsProfile?.profileType === 'student' && scope.emsProfile.profileId) {
            // Get student's enrolled courses
            const { data: enrollments } = await ems.enrollments()
                .select('course_id')
                .eq('student_id', scope.emsProfile.profileId)
                .eq('enrollment_status', 'ACTIVE')
                .is('deleted_at', null);

            courseIds = enrollments?.map((e: any) => e.course_id) || [];
            if (courseIds.length === 0) {
                return successResponse([], 'No enrolled courses found');
            }
        }

        const { searchParams } = new URL(req.url);
        const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
        const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20')));

        const data = await QuizService.getAllQuizzes(scope.companyId!, courseIds, page, limit);

        return successResponse(data, 'Quizzes fetched successfully');
    } catch (error: any) {
        return errorResponse(null, error.message || 'Failed to fetch quizzes');
    }
}

export async function POST(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse(null, 'Unauthorized', 401);

        const menuAccess = await requireMenuAccessAppRouter(req, 'ems.quizzes');
        if (menuAccess instanceof Response) return menuAccess;

        let data = await req.json();
        console.log('[Quiz POST] Received data:', JSON.stringify(data, null, 2));

        data = await autoAssignCompany(userId, data);

        // Add audit fields
        data.created_by = userId;
        data.updated_by = userId;

        console.log('[Quiz POST] After autoAssignCompany:', JSON.stringify(data, null, 2));

        const quiz = await QuizService.createQuiz(data);

        return successResponse(quiz, 'Quiz created successfully', 201);
    } catch (error: any) {
        console.error('[Quiz POST] Error:', error);
        console.error('[Quiz POST] Error message:', error.message);
        console.error('[Quiz POST] Error stack:', error.stack);


        // Return more detailed error for debugging
        return errorResponse(
            error.code || 'QUIZ_CREATE_ERROR',
            error.message || 'Failed to create quiz',
            500,
            {
                code: error.code,
                details: error.details,
                hint: error.hint
            }
        );
    }
}
