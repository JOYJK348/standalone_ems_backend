import { NextRequest } from 'next/server';
import { successResponse, asyncHandler } from '@/lib/errorHandler';
import { getUserIdFromToken } from '@/lib/jwt';
import { PracticeService } from '@/lib/services/PracticeService';
import { requireMenuAccessAppRouter } from '@/lib/menuAccessAppRouter';
import { dataCache } from '@/lib/cache/dataCache';

export const GET = asyncHandler(async (req: NextRequest) => {
    const userId = await getUserIdFromToken(req);
    if (!userId) throw new Error('Unauthorized');

    const menuAccess = await requireMenuAccessAppRouter(req, 'ems.practice.status');
    if (menuAccess instanceof Response) return menuAccess;

    const { searchParams } = new URL(req.url);
    const moduleType = searchParams.get('moduleType') as 'GST' | 'TDS' | 'INCOME_TAX' | null;
    const id = searchParams.get('id');
    const action = searchParams.get('action');

    if (action === 'pick-random' && moduleType) {
        const excludeParam = searchParams.get('excludeIds');
        const excludeIds = excludeParam ? excludeParam.split(',').map(Number) : [];
        const scenario = await PracticeService.pickRandomScenario(moduleType, excludeIds);
        return successResponse(scenario, 'Random scenario picked');
    }

    if (id) {
        const scenario = await PracticeService.getScenarioById(Number(id));
        return successResponse(scenario, 'Scenario fetched');
    }

    // Cache scenario listing for 2 minutes (quasi-static data)
    const cacheKey = `ems_practice_scenarios:${moduleType || 'all'}`;
    const cached = await dataCache.get(cacheKey);
    if (cached) return successResponse(cached, 'Scenarios fetched (cached)');

    const scenarios = await PracticeService.getScenarios(moduleType || undefined);
    await dataCache.set(cacheKey, scenarios, 2 * 60 * 1000);
    return successResponse(scenarios, 'Scenarios fetched');
});
