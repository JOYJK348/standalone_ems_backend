import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/errorHandler';
import { getUserTenantScope } from '@/middleware/tenantFilter';
import { getUserIdFromToken } from '@/lib/jwt';
import { QuizService } from '@/lib/services/QuizService';
import { requireMenuAccessAppRouter } from '@/lib/menuAccessAppRouter';

export async function GET(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse(null, 'Unauthorized', 401);
        const menuAccess = await requireMenuAccessAppRouter(req, 'ems.quizzes.edit');
        if (menuAccess instanceof Response) return menuAccess;

        const scope = await getUserTenantScope(userId);
        const quizId = parseInt(params.id);

        const quiz = await QuizService.getQuizById(quizId, scope.companyId!);

        return successResponse(quiz, 'Quiz fetched successfully');
    } catch (error: any) {
        return errorResponse(null, error.message || 'Failed to fetch quiz');
    }
}

export async function PUT(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse(null, 'Unauthorized', 401);
        const menuAccess = await requireMenuAccessAppRouter(req, 'ems.quizzes.edit');
        if (menuAccess instanceof Response) return menuAccess;

        const scope = await getUserTenantScope(userId);
        const quizId = parseInt(params.id);
        const data = await req.json();

        const updated = await QuizService.updateQuiz(quizId, scope.companyId!, data);

        return successResponse(updated, 'Quiz updated successfully');
    } catch (error: any) {
        return errorResponse(null, error.message || 'Failed to update quiz');
    }
}

export async function PATCH(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse(null, 'Unauthorized', 401);
        const menuAccess = await requireMenuAccessAppRouter(req, 'ems.quizzes.edit');
        if (menuAccess instanceof Response) return menuAccess;

        const scope = await getUserTenantScope(userId);
        const quizId = parseInt(params.id);
        const data = await req.json();

        // Add updated_by field
        data.updated_by = userId;

        const updated = await QuizService.updateQuiz(quizId, scope.companyId!, data);

        return successResponse(updated, 'Quiz updated successfully');
    } catch (error: any) {
        return errorResponse(null, error.message || 'Failed to update quiz');
    }
}

export async function DELETE(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse(null, 'Unauthorized', 401);
        const menuAccess = await requireMenuAccessAppRouter(req, 'ems.quizzes.edit');
        if (menuAccess instanceof Response) return menuAccess;

        const scope = await getUserTenantScope(userId);
        const quizId = parseInt(params.id);

        await QuizService.deleteQuiz(quizId, scope.companyId!, userId);

        return successResponse({ id: quizId, deleted: true }, 'Quiz deleted successfully');
    } catch (error: any) {
        return errorResponse(null, error.message || 'Failed to delete quiz');
    }
}
