/**
 * EMS API - Tutors
 * Route: /api/ems/tutors
 */

import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/errorHandler';
import { getUserIdFromToken } from '@/lib/jwt';
import { autoAssignCompany, getUserTenantScope } from '@/middleware/tenantFilter';
import { TutorService } from '@/lib/services/TutorService';
import { requireMenuAccessAppRouter } from '@/lib/menuAccessAppRouter';
import { dataCache } from '@/lib/cache/dataCache';

const CACHE_TTL = 60 * 1000;

export async function GET(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse(null, 'Unauthorized', 401);

        const menuAccess = await requireMenuAccessAppRouter(req, 'ems.tutors');
        if (menuAccess instanceof Response) return menuAccess;

        const scope = await getUserTenantScope(userId);
        if (!scope.companyId) return errorResponse(null, 'Company context required', 400);

        const searchParams = req.nextUrl.searchParams;
        const mode = searchParams.get('mode');

        if (mode === 'candidates') {
            const candidates = await TutorService.getPotentialTutors(scope.companyId);
            return successResponse(candidates, `Candidates fetched successfully`);
        }

        const courseId = searchParams.get('courseId') ? parseInt(searchParams.get('courseId')!) : undefined;

        const cacheKey = `ems_tutors:${scope.companyId}:${courseId || 'all'}`;
        const cached = await dataCache.get(cacheKey);
        if (cached) return successResponse(cached, `Tutors fetched successfully (${cached?.length || 0} records) (cached)`);

        const data = await TutorService.getAllTutors(scope.companyId, courseId);

        await dataCache.set(cacheKey, data, CACHE_TTL);
        return successResponse(data, `Tutors fetched successfully (${data?.length || 0} records)`);

    } catch (error: any) {
        return errorResponse(null, error.message || 'Failed to fetch tutors');
    }
}

export async function POST(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse(null, 'Unauthorized', 401);

        const menuAccess = await requireMenuAccessAppRouter(req, 'ems.tutors');
        if (menuAccess instanceof Response) return menuAccess;

        let data = await req.json();

        // Auto-assign company and branch context
        data = await autoAssignCompany(userId, data);

        if (data.employee_id) {
            // Assign existing employee as Tutor
            await TutorService.assignTutorRole(data.company_id, data.employee_id);
            return successResponse({ success: true }, 'Employee promoted to Tutor successfully');
        }

        // Fallback: Create new user & employee (Legacy/Admin flow)
        const tutor = await TutorService.createTutor(data);

        return successResponse(tutor, 'Tutor account created successfully', 201);

    } catch (error: any) {
        return errorResponse(null, error.message || 'Failed to add tutor');
    }
}
