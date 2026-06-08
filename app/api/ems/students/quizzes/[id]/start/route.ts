/**
 * EMS Student Quiz Start API
 * Route: /api/ems/students/quizzes/[id]/start
 */

import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/errorHandler';
import { getUserIdFromToken } from '@/lib/jwt';
import { ems } from '@/lib/supabase';
import { requireMenuAccessAppRouter } from '@/lib/menuAccessAppRouter';

export async function POST(
    req: NextRequest,
    context: { params: any }
) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse(null, 'Unauthorized', 401);

        const menuAccess = await requireMenuAccessAppRouter(req, 'ems.students.quizzes.start');
        if (menuAccess instanceof Response) return menuAccess;

        const params = await context.params;
        const quizId = parseInt(params.id);

        console.log(`[Quiz Start] Starting attempt for Quiz ID: ${quizId}`);

        if (isNaN(quizId)) {
            return errorResponse('INVALID_REQUEST', 'Invalid Quiz ID', 400);
        }

        const scope = await import('@/middleware/tenantFilter').then(m =>
            m.getUserTenantScope(userId)
        );

        // Get student record
        const { data: student, error: studentError } = await ems.students()
            .select('id')
            .eq('user_id', userId)
            .eq('company_id', scope.companyId!)
            .is('deleted_at', null)
            .single();

        if (studentError || !student) {
            console.error('[Quiz Start] Student record not found:', studentError);
            return errorResponse('NOT_FOUND', 'Student record not found', 404);
        }

        // Fetch quiz details for max_attempts
        const { data: quiz, error: quizError } = await ems.quizzes()
            .select('max_attempts, duration_minutes')
            .eq('id', quizId)
            .single();

        if (quizError || !quiz) {
            console.error('[Quiz Start] Quiz not found:', quizError);
            return errorResponse('NOT_FOUND', 'Quiz not found', 404);
        }

        // 1. Check for an existing 'IN_PROGRESS' attempt to allow resuming
        const { data: existingAttempt } = await ems.quizAttempts()
            .select('*')
            .eq('quiz_id', quizId)
            .eq('student_id', student.id)
            .eq('status', 'IN_PROGRESS')
            .order('started_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (existingAttempt) {
            console.log(`[Quiz Start] Found existing in-progress attempt ${existingAttempt.id}. Resuming.`);
            return successResponse(existingAttempt, 'Resuming active quiz attempt');
        }

        // 2. No active attempt, check total count vs max_attempts
        const { count, error: countError } = await ems.quizAttempts()
            .select('*', { count: 'exact', head: true })
            .eq('quiz_id', quizId)
            .eq('student_id', student.id);

        if (countError) {
            console.error('[Quiz Start] Count check error:', countError);
        }

        if (quiz?.max_attempts && (count || 0) >= quiz.max_attempts) {
            return errorResponse('LIMIT_REACHED', 'Maximum attempts reached for this quiz. You cannot start a new attempt.', 400);
        }

        // 3. Create new attempt
        const { data: attempt, error: insertError } = await ems.quizAttempts()
            .insert({
                company_id: scope.companyId,
                quiz_id: quizId,
                student_id: student.id,
                attempt_number: (count || 0) + 1,
                started_at: new Date().toISOString(),
                status: 'IN_PROGRESS',
            } as any)
            .select()
            .single();

        if (insertError) {
            console.error('[Quiz Start] Attempt creation failed:', insertError);
            throw insertError;
        }

        return successResponse(attempt, 'Quiz attempt started');

    } catch (error: any) {
        console.error('Start Student Quiz Error:', error);
        return errorResponse('SERVER_ERROR', error.message || 'Failed to start quiz');
    }
}
