/**
 * EMS API - Tutor Students
 * Route: /api/ems/tutor/students
 */

import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/errorHandler';
import { getUserIdFromToken } from '@/lib/jwt';
import { getUserTenantScope } from '@/middleware/tenantFilter';
import { EnrollmentService } from '@/lib/services/EnrollmentService';
import { requireMenuAccessAppRouter } from '@/lib/menuAccessAppRouter';
import { dataCache } from '@/lib/cache/dataCache';

const CACHE_TTL = 60 * 1000;

export async function GET(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse(null, 'Unauthorized', 401);
        const menuAccess = await requireMenuAccessAppRouter(req, 'ems.tutor.students');
        if (menuAccess instanceof Response) return menuAccess;

        const scope = await getUserTenantScope(userId);
        if (!scope.companyId) return errorResponse(null, 'Company context required', 400);

        const cacheKey = `ems_tutor_students:${userId}:${scope.companyId}`;
        const cached = await dataCache.get(cacheKey);
        if (cached) return successResponse(cached, 'Tutor students fetched successfully (cached)');

        const { core } = require('@/lib/supabase');

        // Get tutor's employee record
        const { data: employee } = await core.employees()
            .select('id')
            .eq('user_id', userId)
            .eq('company_id', scope.companyId!)
            .single();

        if (!employee) {
            return errorResponse(null, 'Employee record not found', 404);
        }

        const data = await EnrollmentService.getTutorStudents(
            employee.id,
            scope.companyId!
        );

        await dataCache.set(cacheKey, data, CACHE_TTL);
        return successResponse(data, 'Tutor students fetched successfully');

    } catch (error: any) {
        return errorResponse(null, error.message || 'Failed to fetch students');
    }
}
