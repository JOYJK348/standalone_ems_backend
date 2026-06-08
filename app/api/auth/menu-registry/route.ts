import { NextRequest } from 'next/server';
import { supabaseService } from '@/lib/supabase';
import { SCHEMAS } from '@/config/constants';
import { successResponse, errorResponse } from '@/lib/errorHandler';
import { dataCache } from '@/lib/cache/dataCache';

const CACHE_TTL = 10 * 60 * 1000;

/**
 * AUTH: Menu Registry API (Master List)
 * Route: /api/auth/menu-registry
 */
export async function GET(_req: NextRequest) {
    try {
        const cacheKey = 'ems_menu_registry';
        const cached = await dataCache.get(cacheKey);
        if (cached) return successResponse(cached, 'Menu registry fetched successfully (cached)');

        const { data, error } = await supabaseService
            .schema(SCHEMAS.AUTH)
            .from('menu_registry')
            .select('*')
            .order('sort_order', { ascending: true });

        if (error) throw new Error(error.message);
        await dataCache.set(cacheKey, data, CACHE_TTL);
        return successResponse(data, 'Menu registry fetched successfully');
    } catch (error: any) {
        return errorResponse(null, error.message || 'Failed to fetch menu registry');
    }
}
