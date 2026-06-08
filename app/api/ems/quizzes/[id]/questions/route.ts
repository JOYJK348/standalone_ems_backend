/**
 * EMS API - Quiz Questions
 * Route: /api/ems/quizzes/[id]/questions
 */

import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/errorHandler';
import { getUserIdFromToken } from '@/lib/jwt';
import { getUserTenantScope } from '@/middleware/tenantFilter';
import { ems } from '@/lib/supabase';
import { requireMenuAccessAppRouter } from '@/lib/menuAccessAppRouter';

export async function GET(
    req: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse(null, 'Unauthorized', 401);
        const menuAccess = await requireMenuAccessAppRouter(req, 'ems.quizzes.questions');
        if (menuAccess instanceof Response) return menuAccess;

        const { id } = await context.params;
        const quizId = parseInt(id);
        const scope = await getUserTenantScope(userId);

        const { data: questions, error } = await ems.quizQuestions()
            .select(`
                *,
                quiz_options (
                    id,
                    option_text,
                    option_order,
                    is_correct
                )
            `)
            .eq('quiz_id', quizId)
            .eq('company_id', scope.companyId!)
            .eq('is_active', true)
            .order('question_order', { ascending: true });

        if (error) throw error;
        return successResponse(questions, 'Questions fetched successfully');
    } catch (error: any) {
        console.error('[Quiz Questions GET] Error:', error);
        return errorResponse(null, error.message || 'Failed to fetch questions');
    }
}

export async function POST(
    req: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const fs = require('fs');
    const logFile = 'e:\\ERP\\CLONE\\foundation_durkkas\\backend\\SAVE_DEBUG_FINAL.txt';
    try {
        const userId = await getUserIdFromToken(req);
        const { id } = await context.params;
        const quizId = parseInt(id);
        const scope = await getUserTenantScope(userId);
        const { questions } = await req.json();

        fs.appendFileSync(logFile, `\n[${new Date().toISOString()}] HIT POST: Quiz ${quizId}, Company ${scope.companyId}, Questions ${questions?.length}\n`);

        if (!questions || !Array.isArray(questions)) {
            fs.appendFileSync(logFile, `ERROR: Invalid payload\n`);
            return errorResponse(null, 'Invalid questions data', 400);
        }

        // 1. Delete
        await ems.quizQuestions().delete().eq('quiz_id', quizId).eq('company_id', scope.companyId!);

        // 2. Insert
        for (const q of questions) {
            const { data: question, error: qErr } = await ems.quizQuestions().insert({
                quiz_id: quizId,
                company_id: scope.companyId,
                question_text: q.question_text,
                marks: q.marks || 1,
                question_type: q.question_type || 'MCQ',
                question_order: q.question_order || 1
            }).select().single();

            if (qErr) {
                fs.appendFileSync(logFile, `Q ERR: ${qErr.message}\n`);
                continue;
            }

            if (q.options?.length > 0) {
                const opts = q.options.map((o: any, idx: number) => ({
                    question_id: question.id,
                    option_text: o.option_text,
                    is_correct: !!o.is_correct,
                    option_order: o.option_order || (idx + 1)
                }));
                const { error: oErr } = await ems.quizOptions().insert(opts);
                if (oErr) fs.appendFileSync(logFile, `OPT ERR for Q ${question.id}: ${oErr.message}\n`);
            }
        }

        // 3. Update count
        await ems.quizzes().update({ total_questions: questions.length } as any).eq('id', quizId);

        fs.appendFileSync(logFile, `SUCCESS\n`);
        return successResponse({ quiz_id: quizId }, 'Saved');

    } catch (error: any) {
        fs.appendFileSync(logFile, `GLOBAL ERROR: ${error.message}\n`);
        return errorResponse(null, error.message);
    }
}
