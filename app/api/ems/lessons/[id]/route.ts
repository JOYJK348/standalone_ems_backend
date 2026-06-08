/**
 * EMS API - Lessons Update
 * Route: /api/ems/lessons/[id]
 */

import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/errorHandler';
import { getUserIdFromToken } from '@/lib/jwt';
import { lessonSchema } from '@/lib/validations/ems';
import { CourseService } from '@/lib/services/CourseService';
import { requireMenuAccessAppRouter } from '@/lib/menuAccessAppRouter';

export async function PATCH(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse(null, 'Unauthorized', 401);
        const menuAccess = await requireMenuAccessAppRouter(req, 'ems.content.lessons.edit');
        if (menuAccess instanceof Response) return menuAccess;

        const body = await req.json();
        const validatedData = lessonSchema.partial().parse(body);

        const lesson = await CourseService.updateLesson(
            parseInt(params.id),
            validatedData
        );

        return successResponse(lesson, 'Lesson updated successfully');

    } catch (error: any) {
        if (error.name === 'ZodError') {
            return errorResponse(error.errors, 'Validation failed', 400);
        }
        return errorResponse(null, error.message || 'Failed to update lesson');
    }
}
