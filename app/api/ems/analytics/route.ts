/**
 * EMS API - Analytics & Reports
 * Route: /api/ems/analytics
 */

import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/errorHandler';
import { getUserIdFromToken } from '@/lib/jwt';
import { getUserTenantScope } from '@/middleware/tenantFilter';
import { AnalyticsService } from '@/lib/services/AnalyticsService';
import { requireMenuAccessAppRouter } from '@/lib/menuAccessAppRouter';
import { dataCache } from '@/lib/cache/dataCache';

const CACHE_TTL = 30 * 1000;

export async function GET(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse(null, 'Unauthorized', 401);

        const menuAccess = await requireMenuAccessAppRouter(req, 'ems.analytics');
        if (menuAccess instanceof Response) return menuAccess;

        const scope = await getUserTenantScope(userId);
        const { searchParams } = new URL(req.url);
        const type = searchParams.get('type') || 'overview'; // overview, course, growth
        const courseId = searchParams.get('course_id');

        const cacheKey = `ems_analytics:${scope.companyId}:${type}:${courseId || 'all'}`;
        const cached = await dataCache.get(cacheKey);
        if (cached) return successResponse(cached, `Analytics (${type}) fetched successfully (cached)`);

        let data;

        switch (type) {
            case 'course':
                if (!courseId) return errorResponse(null, 'course_id is required for course analytics', 400);
                data = await AnalyticsService.getCoursePerformance(parseInt(courseId), scope.companyId!);
                break;

            case 'growth':
                data = await AnalyticsService.getStudentGrowth(scope.companyId!);
                break;

            case 'overview':
            default:
                data = await AnalyticsService.getCompanyOverview(scope.companyId!);
                break;
        }

        await dataCache.set(cacheKey, data, CACHE_TTL);
        return successResponse(data, `Analytics (${type}) fetched successfully`);

    } catch (error: any) {
        return errorResponse(null, error.message || 'Failed to fetch analytics');
    }
}
