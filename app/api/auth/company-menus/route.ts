import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/errorHandler';
// supabase import removed
import { getUserIdFromToken } from '@/lib/jwt';
import { getUserTenantScope } from '@/middleware/tenantFilter';

// Use core helper which targets SCHEMAS.CORE ('core')
import { core } from '@/lib/supabase';
import { getCachedData, cacheData, deleteCachedData } from '@/lib/redis';
// ... (keep other imports)

export async function GET(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse('UNAUTHORIZED', 'Unauthorized', 401);

        const scope = await getUserTenantScope(userId);
        if (!scope.companyId) {
            return errorResponse('BAD_REQUEST', 'No Company Scope Found', 400);
        }

        const key = `company_${scope.companyId}_menu_config`;
        const cacheToken = `nav:config:${scope.companyId}`;

        // ⚡ Fast Path: Redis Cache
        const cached = await getCachedData(cacheToken);
        if (cached) return successResponse(cached, 'Menu configuration fetched (cached)');

        // Slow Path: Database
        // Use core.globalSettings() wrapper but with correct column names 'key' and 'value'
        const { data, error } = await core.globalSettings()
            .select('value')
            .eq('key', key)
            .single();

        if (error && error.code !== 'PGRST116') {
            throw new Error(error.message);
        }

        const config = data?.value ? JSON.parse(data.value) : {};

        // Cache for 1 hour to prevent constant DB hits
        await cacheData(cacheToken, config, 3600);

        return successResponse(config, 'Menu configuration fetched');

    } catch (error: any) {
        return errorResponse('INTERNAL_ERROR', error.message || 'Failed to fetch menu config', 500);
    }
}

export async function POST(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse('UNAUTHORIZED', 'Unauthorized', 401);

        const scope = await getUserTenantScope(userId);

        if (scope.roleLevel < 4) {
            return errorResponse('FORBIDDEN', 'Permission Denied', 403);
        }

        if (!scope.companyId) {
            return errorResponse('BAD_REQUEST', 'No Company Context', 400);
        }

        const body = await req.json();
        const { config } = body;

        const key = `company_${scope.companyId}_menu_config`;
        const value = JSON.stringify(config);

        // Use core.globalSettings() wrapper but with correct column names 'key' and 'value'
        const { data, error } = await core.globalSettings()
            .upsert(
                {
                    key,
                    value,
                    description: 'Company Level Menu Permissions',
                    is_system_setting: false
                },
                { onConflict: 'key' }
            )
            .select()
            .single();

        if (error) throw new Error(error.message);

        // 🔄 Sync: Invalidate cache so frontend gets new config immediately
        await deleteCachedData(`nav:config:${scope.companyId}`);

        return successResponse(data, 'Menu configuration saved');

    } catch (error: any) {
        return errorResponse('INTERNAL_ERROR', error.message || 'Failed to save menu config', 500);
    }
}
