/**
 * EMS API - Modules Management
 * Route: /api/ems/modules
 */

import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/errorHandler';
import { getUserIdFromToken } from '@/lib/jwt';
import { autoAssignCompany } from '@/middleware/tenantFilter';
import { courseModuleSchema } from '@/lib/validations/ems';
import { CourseService } from '@/lib/services/CourseService';
import { requireMenuAccessAppRouter } from '@/lib/menuAccessAppRouter';

export async function POST(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse(null, 'Unauthorized', 401);
        const menuAccess = await requireMenuAccessAppRouter(req, 'ems.content.modules');
        if (menuAccess instanceof Response) return menuAccess;

        let data = await req.json();
        data = await autoAssignCompany(userId, data);

        const validatedData = courseModuleSchema.parse(data);

        const module = await CourseService.createModule(validatedData);

        return successResponse(module, 'Module created successfully', 201);

    } catch (error: any) {
        if (error.name === 'ZodError') {
            return errorResponse(error.errors, 'Validation failed', 400);
        }
        return errorResponse(null, error.message || 'Failed to create module');
    }
}
