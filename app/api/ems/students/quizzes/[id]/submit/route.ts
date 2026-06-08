/**
 * EMS Student Quiz Submit API
 * Route: /api/ems/students/quizzes/[id]/submit
 */

import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/errorHandler';
import { getUserIdFromToken } from '@/lib/jwt';
import { ems } from '@/lib/supabase';
import { QuizService } from '@/lib/services/QuizService';
import { requireMenuAccessAppRouter } from '@/lib/menuAccessAppRouter';

export async function POST(
    req: NextRequest,
    context: { params: any }
) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) {
            return errorResponse(null, 'Unauthorized', 401);
        }

        const menuAccess = await requireMenuAccessAppRouter(req, 'ems.students.quizzes.submit');
        if (menuAccess instanceof Response) return menuAccess;

        const params = await context.params;
        const quizId = parseInt(params.id);

        console.log(`[Quiz Submit] Processing submission for Quiz ID: ${quizId}`);

        const scope = await import('@/middleware/tenantFilter').then(m =>
            m.getUserTenantScope(userId)
        );

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

        const { attempt_id, answers } = await req.json();

        if (!attempt_id) {
            return errorResponse(null, 'Attempt ID is required', 400);
        }

        // Get quiz for passing marks
        const { data: quiz } = await ems.quizzes()
            .select('passing_marks, total_marks')
            .eq('id', quizId)
            .single();

        // Update attempt status
        const { error: updateError } = await ems.quizAttempts()
            .update({
                completed_at: new Date().toISOString(),
                status: 'COMPLETED'
            } as any)
            .eq('id', attempt_id)
            .eq('student_id', student.id);

        if (updateError) {
            console.error('[Quiz Submit] Attempt status update failed:', updateError);
            throw updateError;
        }

        // Save answers to quiz_responses
        if (answers && typeof answers === 'object') {
            const responsesToInsert = Object.entries(answers).map(([qId, responseText]) => ({
                attempt_id: attempt_id,
                question_id: parseInt(qId),
                text_response: responseText?.toString() || '',
                answered_at: new Date().toISOString()
            }));

            if (responsesToInsert.length > 0) {
                const { error: responseError } = await (ems as any).supabase
                    .schema('ems')
                    .from('quiz_responses')
                    .insert(responsesToInsert);

                if (responseError) {
                    console.error('[Quiz Submit] Failed to save quiz responses:', responseError);
                    throw responseError;
                }
            }
        }

        // Auto-grade the attempt
        const gradedAttempt = await QuizService.autoGradeAttempt(attempt_id);

        // Calculate if passed
        const marksObtained = Number(gradedAttempt.marks_obtained || 0);
        const totalMarks = Number(gradedAttempt.total_marks || quiz?.total_marks || 1);
        const percentage = totalMarks > 0 ? Math.round((marksObtained / totalMarks) * 100) : 0;
        const isPassed = marksObtained >= (quiz?.passing_marks || 0);

        // Final update with percentage and pass status
        const { data: finalAttempt, error: finalError } = await ems.quizAttempts()
            .update({
                percentage,
                is_passed: isPassed
            } as any)
            .eq('id', attempt_id)
            .select('id, marks_obtained, percentage, is_passed, submitted_at:completed_at, correct_answers, wrong_answers, unanswered, total_questions')
            .single();

        if (finalError) {
            console.error('[Quiz Submit] Final update failed:', finalError);
            throw finalError;
        }

        return successResponse({
            ...finalAttempt,
            score: finalAttempt.marks_obtained
        }, 'Quiz submitted and graded successfully');

    } catch (error: any) {
        console.error('Submit Student Quiz Error:', error);
        return errorResponse(null, error.message || 'Failed to submit quiz');
    }
}
