/**
 * EMS API - Dashboard Statistics (Multi-Tenant)
 * Route: /api/ems/dashboard/stats
 */

import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/errorHandler';
import { getUserTenantScope } from '@/middleware/tenantFilter';
import { getUserIdFromToken } from '@/lib/jwt';
import { EMSStatisticsService } from '@/lib/services/EMSStatisticsService';
import { dataCache } from '@/lib/cache/dataCache';
import { requireMenuAccessAppRouter } from '@/lib/menuAccessAppRouter';

export async function GET(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse(null, 'Unauthorized', 401);

        const menuAccess = await requireMenuAccessAppRouter(req, 'ems.dashboard');
        if (menuAccess instanceof Response) return menuAccess;

        const scope = await getUserTenantScope(userId);

        if (!scope.companyId) {
            return errorResponse(null, 'Company context required', 400);
        }

        // 🚀 CACHE CHECK
        const cacheKey = `ems_dashboard_stats:${scope.companyId}`;
        const cachedData = await dataCache.get(cacheKey);
        if (cachedData) {
            return successResponse(cachedData, 'Dashboard statistics (cached)');
        }

        // Fetch comprehensive dashboard statistics
        const stats = await EMSStatisticsService.getDashboardStats(scope.companyId);

        // 🚀 CACHE SET
        await dataCache.set(cacheKey, stats, 60 * 1000); // 1 minute cache

        return successResponse(stats, 'Dashboard statistics fetched successfully');

    } catch (error: any) {
        return errorResponse(null, error.message || 'Failed to fetch dashboard statistics');
    }
}
