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

export async function GET(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse(null, 'Unauthorized', 401);
        const menuAccess = await requireMenuAccessAppRouter(req, 'ems.tutor.students');
        if (menuAccess instanceof Response) return menuAccess;

        const scope = await getUserTenantScope(userId);
        if (!scope.companyId) return errorResponse(null, 'Company context required', 400);

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

        return successResponse(data, 'Tutor students fetched successfully');

    } catch (error: any) {
        return errorResponse(null, error.message || 'Failed to fetch students');
    }
}
