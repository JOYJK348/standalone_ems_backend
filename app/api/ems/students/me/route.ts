/**
 * EMS API - Current Student Profile
 * Route: /api/ems/students/me
 */

import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/errorHandler';
import { getUserIdFromToken } from '@/lib/jwt';
import { StudentService } from '@/lib/services/StudentService';
import { requireMenuAccessAppRouter } from '@/lib/menuAccessAppRouter';

export async function GET(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse(null, 'Unauthorized', 401);

        const menuAccess = await requireMenuAccessAppRouter(req, 'ems.students.profile');
        if (menuAccess instanceof Response) return menuAccess;

        const student = await StudentService.getStudentByUserId(userId);

        if (!student) {
            return errorResponse(null, 'Student record not found for this user', 404);
        }

        return successResponse(student, 'Profile fetched successfully');

    } catch (error: any) {
        return errorResponse(null, error.message || 'Failed to fetch profile');
    }
}
