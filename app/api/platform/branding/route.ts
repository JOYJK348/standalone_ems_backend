import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/errorHandler';
import { getUserIdFromToken } from '@/lib/jwt';
import { getUserTenantScope } from '@/middleware/tenantFilter';
import { core } from '@/lib/supabase';
import { AuditService } from '@/lib/services/AuditService';

/**
 * GET /api/platform/branding - Get platform branding
 */
export async function GET(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse('UNAUTHORIZED', 'Unauthorized', 401);

        const { getCachedData, cacheData, CACHE_KEYS, CACHE_TTL } = require('@/lib/redis');

        // 1. Try Cache First
        const cached = await getCachedData(CACHE_KEYS.BRANDING_PLATFORM);
        if (cached) {
            console.log('[BRANDING] Platform branding fetched from Redis cache');
            return successResponse(cached, 'Platform branding fetched (cached)');
        }

        // Platform branding should be visible to any logged-in user for fallback UI/UX
        // But scope check is good for other reasons
        const scope = await getUserTenantScope(userId);

        const { data: branding, error } = await core.platformBranding()
            .select('*')
            .eq('is_active', true)
            .single();

        if (error && error.code !== 'PGRST116') {
            throw new Error(error.message);
        }

        const result = branding || {};

        // 2. Cache the result for 24 hours
        await cacheData(CACHE_KEYS.BRANDING_PLATFORM, result, CACHE_TTL.BRANDING);

        return successResponse(result, 'Platform branding fetched');
    } catch (error: any) {
        return errorResponse('INTERNAL_ERROR', error.message);
    }
}

/**
 * PUT /api/platform/branding - Update platform branding
 */
export async function PUT(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse('UNAUTHORIZED', 'Unauthorized', 401);

        const { deleteCachedData, CACHE_KEYS } = require('@/lib/redis');

        const scope = await getUserTenantScope(userId);
        if (scope.roleLevel < 5) {
            return errorResponse('FORBIDDEN', 'Platform Admin access required', 403);
        }

        const body = await req.json();
        const {
            platform_name,
            tagline,
            logo_url,
            favicon_url,
            dark_logo_url,
            primary_color,
            secondary_color,
            accent_color,
            copyright_text,
            support_url,
            terms_url,
            privacy_url
        } = body;

        // Check if branding exists
        const { data: existing } = await core.platformBranding()
            .select('id')
            .single();

        const updateData: Record<string, any> = {
            platform_name,
            tagline,
            logo_url,
            favicon_url,
            dark_logo_url,
            primary_color,
            secondary_color,
            accent_color,
            copyright_text,
            support_url,
            terms_url,
            privacy_url,
            updated_by: userId
        };

        let result;
        if (existing) {
            // Update existing
            result = await core.platformBranding()
                .update(updateData)
                .eq('id', existing.id)
                .select()
                .single();
        } else {
            // Insert new
            updateData.created_by = userId;
            result = await core.platformBranding()
                .insert(updateData)
                .select()
                .single();
        }

        if (result.error) {
            throw new Error(result.error.message);
        }

        // 🛡️ INVALIDATE CACHE
        await deleteCachedData(CACHE_KEYS.BRANDING_PLATFORM);
        console.log('[BRANDING] Platform branding cache invalidated after update');

        // Log to audit
        const ipAddress = AuditService.getIP(req);
        const userAgent = req.headers.get('user-agent') || 'unknown';

        await AuditService.logAction({
            userId,
            action: existing ? 'UPDATE' : 'CREATE',
            tableName: 'platform_branding',
            schemaName: 'core',
            recordId: String(result.data?.id || 0),
            newData: updateData,
            ipAddress,
            userAgent
        });

        return successResponse(result.data, 'Platform branding updated');
    } catch (error: any) {
        return errorResponse('INTERNAL_ERROR', error.message);
    }
}
