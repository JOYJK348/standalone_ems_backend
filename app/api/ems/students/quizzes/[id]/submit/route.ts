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
    const fs = require('fs');
    const logFile = 'e:\\ERP\\CLONE\\foundation_durkkas\\backend\\SUBMIT_REACHED.txt';
    try {
        fs.appendFileSync(logFile, `[${new Date().toISOString()}] SUBMIT REQUEST START\n`);
        const userId = await getUserIdFromToken(req);
        if (!userId) {
            fs.appendFileSync(logFile, `ERROR: Unauthorized\n`);
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
        fs.appendFileSync(logFile, `Updating attempt ${attempt_id} status\n`);
        const { error: updateError } = await ems.quizAttempts()
            .update({
                completed_at: new Date().toISOString(),
                status: 'COMPLETED'
            } as any)
            .eq('id', attempt_id)
            .eq('student_id', student.id);

        if (updateError) {
            fs.appendFileSync(logFile, `Attempt status update failed: ${updateError.message}\n`);
            console.error('[Quiz Submit] Attempt status update failed:', updateError);
            throw updateError;
        }

        // Save answers to quiz_responses
        fs.appendFileSync(logFile, `Saving ${Object.keys(answers || {}).length} responses\n`);
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
                    fs.appendFileSync(logFile, `Failed to save responses: ${responseError.message}\n`);
                    console.error('[Quiz Submit] Failed to save quiz responses:', responseError);
                    throw responseError;
                }
            }
        }

        // Auto-grade the attempt
        fs.appendFileSync(logFile, `Starting auto-grading for attempt ${attempt_id}\n`);
        const gradedAttempt = await QuizService.autoGradeAttempt(attempt_id);
        fs.appendFileSync(logFile, `Graded: ${gradedAttempt.marks_obtained}/${gradedAttempt.total_marks}\n`);

        // Calculate if passed
        const marksObtained = Number(gradedAttempt.marks_obtained || 0);
        const totalMarks = Number(gradedAttempt.total_marks || quiz?.total_marks || 1);
        const percentage = totalMarks > 0 ? Math.round((marksObtained / totalMarks) * 100) : 0;
        const isPassed = marksObtained >= (quiz?.passing_marks || 0);

        fs.appendFileSync(logFile, `Calculated results: ${percentage}%, Passed: ${isPassed}\n`);

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
            fs.appendFileSync(logFile, `Final update failed: ${finalError.message}\n`);
            console.error('[Quiz Submit] Final update failed:', finalError);
            throw finalError;
        }

        fs.appendFileSync(logFile, `SUCCESS for attempt ${attempt_id}\n`);
        return successResponse({
            ...finalAttempt,
            score: finalAttempt.marks_obtained // Map for frontend convenience
        }, 'Quiz submitted and graded successfully');

    } catch (error: any) {
        const fs = require('fs');
        const logFile = 'e:\\ERP\\CLONE\\foundation_durkkas\\backend\\SUBMIT_ERROR_LOG.txt';
        fs.appendFileSync(logFile, `[${new Date().toISOString()}] SUBMIT ERROR: ${error.message}\nStack: ${error.stack}\n`);
        console.error('Submit Student Quiz Error:', error);
        return errorResponse(null, error.message || 'Failed to submit quiz');
    }
}
