/**
 * EMS Student Quiz Questions API
 * Route: /api/ems/students/quizzes/[id]/questions
 */

import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/errorHandler';
import { getUserIdFromToken } from '@/lib/jwt';
import { ems } from '@/lib/supabase';
import { QuizService } from '@/lib/services/QuizService';
import { requireMenuAccessAppRouter } from '@/lib/menuAccessAppRouter';

export const dynamic = 'force-dynamic';

export async function GET(
    req: NextRequest,
    context: { params: any }
) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse(null, 'Unauthorized', 401);

        const menuAccess = await requireMenuAccessAppRouter(req, 'ems.students.quizzes.questions');
        if (menuAccess instanceof Response) return menuAccess;

        const params = await context.params;
        const quizId = parseInt(params.id);

        console.log(`[Student Quiz Questions] Fetching for ID: ${quizId}`);

        if (isNaN(quizId)) {
            console.error('[Student Quiz Questions] Invalid Quiz ID');
            return errorResponse(null, 'Invalid quiz ID');
        }

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

        // Verify enrollment/eligibility (Optional but recommended)
        // For now, assume if the tutor assigned it, they are eligible.

        // Get questions using service
        const questionsData = await QuizService.getQuestions(quizId);

        const fs = require('fs');
        const logFile = 'e:\\ERP\\CLONE\\foundation_durkkas\\backend\\quiz_fetch_log.txt';
        fs.appendFileSync(logFile, `\n[${new Date().toISOString()}] FETCH Quiz ${quizId} - Found from DB: ${questionsData?.length}\n`);

        if (!questionsData || questionsData.length === 0) {
            fs.appendFileSync(logFile, `WARN: No questions found in DB for quiz ${quizId}\n`);
            return successResponse([], 'No questions found for this quiz');
        }

        console.log(`[Student Quiz Questions] Raw count from DB: ${questionsData.length}`);

        // IMPORTANT: Strip correct answers for students!
        const sanitizedQuestions = questionsData.map((q: any) => {
            // Extract options - handle different possible join names just in case
            const rawOptions = q.quiz_options || q.ems_quiz_options || [];

            return {
                id: q.id,
                question_text: q.question_text,
                question_type: q.question_type || 'MCQ',
                options: rawOptions
                    .sort((a: any, b: any) => (a.option_order || 0) - (b.option_order || 0))
                    .map((opt: any) => opt.option_text),
                marks: q.marks || 1,
                question_order: q.question_order || 0
            };
        });

        console.log(`[Student Quiz Questions] Returning ${sanitizedQuestions.length} questions to frontend`);

        return successResponse(sanitizedQuestions, 'Quiz questions fetched successfully');

    } catch (error: any) {
        console.error('Fetch Student Quiz Questions Error:', error);
        return errorResponse(null, error.message || 'Failed to fetch quiz questions');
    }
}
