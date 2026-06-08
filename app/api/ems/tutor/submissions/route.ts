/**
 * EMS API - Tutor Submissions
 * Route: /api/ems/tutor/submissions
 */

import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/errorHandler';
import { getUserIdFromToken } from '@/lib/jwt';
import { getUserTenantScope } from '@/middleware/tenantFilter';
import { AssessmentService } from '@/lib/services/AssessmentService';
import { requireMenuAccessAppRouter } from '@/lib/menuAccessAppRouter';

export async function GET(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse(null, 'Unauthorized', 401);
        const menuAccess = await requireMenuAccessAppRouter(req, 'ems.tutor.submissions');
        if (menuAccess instanceof Response) return menuAccess;

        const scope = await getUserTenantScope(userId);
        if (!scope.companyId) return errorResponse(null, 'Company context required', 400);

        const { searchParams } = new URL(req.url);
        const status = searchParams.get('status') || undefined;

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

        const data = await AssessmentService.getTutorSubmissions(
            employee.id,
            scope.companyId!,
            status
        );

        return successResponse(data, `Submissions fetched successfully (${data?.length || 0} records)`);

    } catch (error: any) {
        return errorResponse(null, error.message || 'Failed to fetch submissions');
    }
}
