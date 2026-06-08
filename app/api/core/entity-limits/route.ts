import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/errorHandler';
import { getUserIdFromToken } from '@/lib/jwt';
import { checkEntityCreationLimit, EntityType } from '@/middleware/permanentIdentity';

export const dynamic = 'force-dynamic';

/**
 * GET /api/core/entity-limits?type=department
 * Check if user can create more entities of given type
 * Returns current count, maximum, and remaining
 */
export async function GET(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) {
            return errorResponse('AUTHENTICATION_REQUIRED', 'Please login to continue', 401);
        }

        const entityType = req.nextUrl.searchParams.get('type') as EntityType;

        if (!entityType || !['department', 'designation', 'branch', 'employee'].includes(entityType)) {
            return errorResponse('VALIDATION_ERROR', 'Invalid entity type. Must be: department, designation, branch, or employee', 400);
        }

        const limitCheck = await checkEntityCreationLimit(userId, entityType);

        return successResponse(limitCheck, 'Entity limit check completed');

    } catch (error: any) {
        console.error('[Entity Limits API] Error:', error);
        return errorResponse('INTERNAL_SERVER_ERROR', error.message || 'Failed to check entity limits', 500);
    }
}
