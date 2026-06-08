/**
 * EMS API - Enrollments
 * Route: /api/ems/enrollments
 */

import { NextRequest } from 'next/server';
import { successResponse, asyncHandler } from '@/lib/errorHandler';
import { getUserIdFromToken } from '@/lib/jwt';
import { autoAssignCompany } from '@/middleware/tenantFilter';
import { enrollmentSchema } from '@/lib/validations/ems';
import { EnrollmentService } from '@/lib/services/EnrollmentService';
import { requireMenuAccessAppRouter } from '@/lib/menuAccessAppRouter';
import { dataCache } from '@/lib/cache/dataCache';

const CACHE_TTL = 60 * 1000;

export const GET = asyncHandler(async (req: NextRequest) => {
    const userId = await getUserIdFromToken(req);
    if (!userId) throw new Error('Unauthorized');

    const menuAccess = await requireMenuAccessAppRouter(req, 'ems.enrollments');
    if (menuAccess instanceof Response) return menuAccess;

    const { searchParams } = new URL(req.url);
    const studentId = searchParams.get('student_id');

    if (!studentId) {
        throw new Error('student_id is required');
    }

    const scope = await import('@/middleware/tenantFilter').then(m =>
        m.getUserTenantScope(userId)
    );

    const cacheKey = `ems_enrollments:${studentId}:${scope.companyId}`;
    const cached = await dataCache.get(cacheKey);
    if (cached) return successResponse(cached, 'Enrollments fetched successfully (cached)');

    const data = await EnrollmentService.getStudentEnrollments(
        parseInt(studentId),
        scope.companyId!
    );

    await dataCache.set(cacheKey, data, CACHE_TTL);
    return successResponse(data, 'Enrollments fetched successfully');
});

export const POST = asyncHandler(async (req: NextRequest) => {
    const userId = await getUserIdFromToken(req);
    if (!userId) throw new Error('Unauthorized');

    const menuAccess = await requireMenuAccessAppRouter(req, 'ems.enrollments');
    if (menuAccess instanceof Response) return menuAccess;

    let data = await req.json();
    data = await autoAssignCompany(userId, data);

    const validatedData = enrollmentSchema.parse(data);

    const enrollment = await EnrollmentService.enrollStudent(validatedData, userId);

    return successResponse(enrollment, 'Student enrolled successfully', 201);
});
