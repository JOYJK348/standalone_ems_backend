/**
 * EMS API - My Quizzes
 * Route: /api/ems/students/my-quizzes
 */

import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/errorHandler';
import { getUserIdFromToken } from '@/lib/jwt';
import { ems } from '@/lib/supabase';
import { requireMenuAccessAppRouter } from '@/lib/menuAccessAppRouter';
import { dataCache } from '@/lib/cache/dataCache';

const CACHE_TTL = 30 * 1000;

export async function GET(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse(null, 'Unauthorized', 401);

        const menuAccess = await requireMenuAccessAppRouter(req, 'ems.students.quizzes');
        if (menuAccess instanceof Response) return menuAccess;

        const scope = await import('@/middleware/tenantFilter').then(m =>
            m.getUserTenantScope(userId)
        );

        const cacheKey = `ems_my_quizzes:${userId}`;
        const cached = await dataCache.get(cacheKey);
        if (cached) return successResponse(cached, 'My quizzes fetched successfully (cached)');

        // Get student record
        const { data: student } = await ems.students()
            .select('id')
            .eq('user_id', userId)
            .eq('company_id', scope.companyId!)
            .is('deleted_at', null)
            .single();

        if (!student) {
            return errorResponse(null, 'Student record not found', 404);
        }

        // Get student enrolled course and batch IDs
        const { data: enrollments } = await ems.enrollments()
            .select('course_id, batch_id')
            .eq('student_id', student.id)
            .eq('company_id', scope.companyId!)
            .eq('enrollment_status', 'ACTIVE')
            .is('deleted_at', null) as any;

        const enrolledCourseIds = (enrollments as any[])?.map((e: any) => e.course_id) || [];
        const enrolledBatches = (enrollments as any[])?.map((e: any) => e.batch_id).filter(Boolean) || [];

        if (enrolledCourseIds.length === 0) {
            return successResponse([], 'You are not enrolled in any courses yet.');
        }

        // 1. Get Quiz IDs assigned to this student, their batches, OR course-wide
        // (Quizzes assigned to the course with no specific batch/student are also included)
        const { data: assignments } = await ems.quizAssignments()
            .select('quiz_id, batch_id, student_id')
            .or(enrolledBatches.length > 0
                ? `batch_id.in.(${enrolledBatches.join(',')}),student_id.eq.${student.id}`
                : `student_id.eq.${student.id}`)
            .eq('company_id', scope.companyId!);

        const specificAssignedIds = assignments?.map(a => a.quiz_id) || [];

        // 2. Fetch all quizzes for the student's courses
        // We will then filter them: either they are in specificAssignedIds OR they have NO entries in quiz_assignments
        const { data: allQuizzes, error } = await ems.quizzes()
            .select(`
                id,
                quiz_title,
                quiz_description,
                quiz_type,
                total_questions,
                total_marks,
                passing_marks,
                duration_minutes,
                start_datetime,
                end_datetime,
                max_attempts,
                course:courses (
                    id,
                    course_name
                ),
                quiz_assignments!quiz_id (
                    id,
                    batch_id,
                    student_id
                )
            `)
            .in('course_id', enrolledCourseIds)
            .eq('company_id', scope.companyId!)
            .eq('is_active', true)
            .is('deleted_at', null)
            .order('start_datetime', { ascending: true }) as any;

        if (error) throw error;

        // 3. Filter quizzes:
        // - Is specifically assigned to this student/batch
        // - OR has NO specific assignments (means it's for everyone in the course)
        const quizzes = (allQuizzes as any[] || []).filter(quiz => {
            const isSpecificallyAssigned = specificAssignedIds.includes(quiz.id);
            const hasNoSpecificAssignments = !quiz.quiz_assignments || quiz.quiz_assignments.length === 0;
            return isSpecificallyAssigned || hasNoSpecificAssignments;
        });

        if (quizzes.length === 0) {
            return successResponse([], 'No quizzes available for your courses yet.');
        }

        if (error) throw error;

        // Get attempts for these quizzes by this student
        const { data: attempts } = await ems.quizAttempts()
            .select('id, quiz_id, attempt_number, marks_obtained, percentage, status, is_passed')
            .eq('student_id', student.id)
            .in('quiz_id', (quizzes as any[])?.map((q: any) => q.id) || []) as any;

        // Combine data
        const mappedQuizzes = (quizzes as any[] || []).map((quiz: any) => {
            const quizAttempts = (attempts as any[])?.filter((a: any) => a.quiz_id === quiz.id) || [];
            const bestAttempt = quizAttempts.sort((a, b) => (b.percentage || 0) - (a.percentage || 0))[0];
            const now = new Date();
            const start = quiz.start_datetime ? new Date(quiz.start_datetime) : null;
            const end = quiz.end_datetime ? new Date(quiz.end_datetime) : null;

            let status = 'active';
            if (start && now < start) status = 'upcoming';
            if (end && now > end) status = 'completed';
            if (quizAttempts.some(a => a.status === 'COMPLETED') && status === 'active') {
                if (quizAttempts.length >= quiz.max_attempts) status = 'completed';
            }

            return {
                ...quiz,
                attempts_taken: quizAttempts.length,
                best_score: bestAttempt?.percentage || null,
                is_passed: bestAttempt?.is_passed || false,
                status: status,
                course_name: quiz.course?.course_name
            };
        });

        await dataCache.set(cacheKey, mappedQuizzes, CACHE_TTL);
        return successResponse(mappedQuizzes, 'My quizzes fetched successfully');

    } catch (error: any) {
        console.error('My Quizzes Error:', error);
        return errorResponse(null, error.message || 'Failed to fetch your quizzes');
    }
}
