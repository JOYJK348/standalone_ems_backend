/**
 * EMS API - Lessons Management
 * Route: /api/ems/lessons
 */

import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/errorHandler';
import { getUserIdFromToken } from '@/lib/jwt';
import { autoAssignCompany } from '@/middleware/tenantFilter';
import { lessonSchema } from '@/lib/validations/ems';
import { CourseService } from '@/lib/services/CourseService';
import { requireMenuAccessAppRouter } from '@/lib/menuAccessAppRouter';

export async function POST(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse(null, 'Unauthorized', 401);
        const menuAccess = await requireMenuAccessAppRouter(req, 'ems.content.lessons');
        if (menuAccess instanceof Response) return menuAccess;

        let data = await req.json();
        data = await autoAssignCompany(userId, data);

        const validatedData = lessonSchema.parse(data);

        const lesson = await CourseService.createLesson(validatedData);

        return successResponse(lesson, 'Lesson created successfully', 201);

    } catch (error: any) {
        if (error.name === 'ZodError') {
            return errorResponse(error.errors, 'Validation failed', 400);
        }
        return errorResponse(null, error.message || 'Failed to create lesson');
    }
}
