import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/errorHandler';
import { getUserMenus } from '@/lib/menuAccess';
import { dataCache } from '@/lib/cache/dataCache';

const CACHE_TTL = 5 * 60 * 1000;

export async function GET(req: NextRequest) {
    try {
        const userId = parseInt(req.headers.get('x-user-id') || '');

        if (isNaN(userId)) {
            return errorResponse('UNAUTHORIZED', 'User not identified', 401);
        }

        const cacheKey = `ems_menus:${userId}`;
        const cached = await dataCache.get(cacheKey);
        if (cached) return successResponse(cached, 'Menus fetched successfully (cached)');

        const menus = await getUserMenus(userId);
        const responseData = { menus };
        await dataCache.set(cacheKey, responseData, CACHE_TTL);
        return successResponse(responseData, 'Menus fetched successfully');
    } catch (error: any) {
        return errorResponse('INTERNAL_SERVER_ERROR', error.message);
    }
}
