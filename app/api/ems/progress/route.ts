/**
 * EMS API - Lesson Progress Tracking
 * Route: /api/ems/progress
 */

import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/errorHandler';
import { getUserIdFromToken } from '@/lib/jwt';
import { autoAssignCompany } from '@/middleware/tenantFilter';
import { lessonProgressSchema } from '@/lib/validations/ems';
import { EnrollmentService } from '@/lib/services/EnrollmentService';
import { requireMenuAccessAppRouter } from '@/lib/menuAccessAppRouter';
import { dataCache } from '@/lib/cache/dataCache';

const CACHE_TTL = 30 * 1000;

export async function GET(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse(null, 'Unauthorized', 401);

        const menuAccess = await requireMenuAccessAppRouter(req, 'ems.progress');
        if (menuAccess instanceof Response) return menuAccess;

        const { searchParams } = new URL(req.url);
        const enrollmentId = searchParams.get('enrollment_id');

        if (!enrollmentId) {
            return errorResponse(null, 'enrollment_id is required', 400);
        }

        const cacheKey = `ems_progress:${enrollmentId}`;
        const cached = await dataCache.get(cacheKey);
        if (cached) return successResponse(cached, 'Progress fetched successfully (cached)');

        const data = await EnrollmentService.getLessonProgress(parseInt(enrollmentId));

        await dataCache.set(cacheKey, data, CACHE_TTL);
        return successResponse(data, 'Progress fetched successfully');

    } catch (error: any) {
        return errorResponse(null, error.message || 'Failed to fetch progress');
    }
}

export async function POST(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse(null, 'Unauthorized', 401);

        const menuAccess = await requireMenuAccessAppRouter(req, 'ems.progress');
        if (menuAccess instanceof Response) return menuAccess;

        let data = await req.json();
        data = await autoAssignCompany(userId, data);

        const validatedData = lessonProgressSchema.parse(data);

        const progress = await EnrollmentService.markLessonComplete(
            validatedData.student_id,
            validatedData.enrollment_id,
            validatedData.lesson_id,
            validatedData.course_id,
            validatedData.company_id
        );

        return successResponse(progress, 'Lesson marked as complete', 201);

    } catch (error: any) {
        if (error.name === 'ZodError') {
            return errorResponse(error.errors, 'Validation failed', 400);
        }
        return errorResponse(null, error.message || 'Failed to update progress');
    }
}
