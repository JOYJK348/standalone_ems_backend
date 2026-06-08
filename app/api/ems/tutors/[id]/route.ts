/**
 * EMS API - Single Tutor
 * Route: /api/ems/tutors/[id]
 */

import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/errorHandler';
import { getUserIdFromToken } from '@/lib/jwt';
import { getUserTenantScope } from '@/middleware/tenantFilter';
import { TutorService } from '@/lib/services/TutorService';
import { requireMenuAccessAppRouter } from '@/lib/menuAccessAppRouter';

export async function GET(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse(null, 'Unauthorized', 401);
        const menuAccess = await requireMenuAccessAppRouter(req, 'ems.tutors.edit');
        if (menuAccess instanceof Response) return menuAccess;

        const scope = await getUserTenantScope(userId);
        if (!scope.companyId) return errorResponse(null, 'Company context required', 400);

        const tutorId = parseInt(params.id);
        const data = await TutorService.getTutorById(tutorId, scope.companyId);

        if (!data) {
            return errorResponse(null, 'Tutor not found', 404);
        }

        return successResponse(data, 'Tutor fetched successfully');

    } catch (error: any) {
        return errorResponse(null, error.message || 'Failed to fetch tutor');
    }
}

export async function PATCH(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse(null, 'Unauthorized', 401);
        const menuAccess = await requireMenuAccessAppRouter(req, 'ems.tutors.edit');
        if (menuAccess instanceof Response) return menuAccess;

        const scope = await getUserTenantScope(userId);
        if (!scope.companyId) return errorResponse(null, 'Company context required', 400);

        const tutorId = parseInt(params.id);
        const updates = await req.json();

        const data = await TutorService.updateTutor(tutorId, updates, scope.companyId);

        return successResponse(data, 'Tutor updated successfully');

    } catch (error: any) {
        return errorResponse(null, error.message || 'Failed to update tutor');
    }
}
