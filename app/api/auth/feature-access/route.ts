import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/errorHandler';
import { getUserIdFromToken } from '@/lib/jwt';
import { getCompanyFeatureAccess, getAccessibleMenus } from '@/middleware/featureAccess';
import { dataCache } from '@/lib/cache/dataCache';

/**
 * GET /api/auth/feature-access
 * Returns user's complete feature access information
 * - Enabled modules
 * - Subscription limits
 * - Accessible menu IDs
 */
export async function GET(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) {
            return errorResponse('AUTHENTICATION_REQUIRED', 'Please login to continue', 401);
        }

        const cacheKey = `auth_feature_access:${userId}`;
        const cached = await dataCache.get(cacheKey);
        if (cached) return successResponse(cached, 'Feature access loaded successfully (cached)');

        // Get complete feature access
        const featureAccess = await getCompanyFeatureAccess(userId);

        // Get accessible menu IDs
        const accessibleMenuIds = await getAccessibleMenus(userId);

        const response = {
            company: {
                id: featureAccess.companyId,
                name: featureAccess.companyName,
                subscriptionPlan: featureAccess.subscriptionPlan,
                subscriptionStatus: featureAccess.subscriptionStatus,
            },
            enabledModules: featureAccess.enabledModules,
            limits: featureAccess.limits,
            accessibleMenuIds,
            isPlatformAdmin: featureAccess.isPlatformAdmin,
        };

        await dataCache.set(cacheKey, response, 60 * 1000);

        return successResponse(response, 'Feature access loaded successfully');

    } catch (error: any) {
        console.error('[Feature Access API] Error:', error);
        return errorResponse('INTERNAL_SERVER_ERROR', error.message || 'Failed to load feature access', 500);
    }
}
