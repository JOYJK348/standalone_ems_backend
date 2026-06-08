/**
 * EMS API - Current Student Profile
 * Route: /api/ems/students/me
 */

import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/errorHandler';
import { getUserIdFromToken } from '@/lib/jwt';
import { StudentService } from '@/lib/services/StudentService';
import { requireMenuAccessAppRouter } from '@/lib/menuAccessAppRouter';
import { dataCache } from '@/lib/cache/dataCache';

const CACHE_TTL = 30 * 1000;

export async function GET(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse(null, 'Unauthorized', 401);

        const menuAccess = await requireMenuAccessAppRouter(req, 'ems.students.profile');
        if (menuAccess instanceof Response) return menuAccess;

        const cacheKey = `ems_student_me:${userId}`;
        const cached = await dataCache.get(cacheKey);
        if (cached) return successResponse(cached, 'Profile fetched successfully (cached)');

        const student = await StudentService.getStudentByUserId(userId);

        if (!student) {
            return errorResponse(null, 'Student record not found for this user', 404);
        }

        await dataCache.set(cacheKey, student, CACHE_TTL);
        return successResponse(student, 'Profile fetched successfully');

    } catch (error: any) {
        return errorResponse(null, error.message || 'Failed to fetch profile');
    }
}
