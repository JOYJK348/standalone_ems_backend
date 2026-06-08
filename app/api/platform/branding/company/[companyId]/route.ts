import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/errorHandler';
import { getUserIdFromToken } from '@/lib/jwt';
import { getUserTenantScope } from '@/middleware/tenantFilter';
import { core } from '@/lib/supabase';
import { AuditService } from '@/lib/services/AuditService';

interface Params {
    params: { companyId: string };
}

/**
 * GET /api/platform/branding/company/[companyId] - Get company branding
 */
export async function GET(req: NextRequest, { params }: Params) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse('UNAUTHORIZED', 'Unauthorized', 401);

        const { getCachedData, cacheData, CACHE_KEYS, CACHE_TTL } = require('@/lib/redis');
        const companyId = parseInt(params.companyId);

        // 1. Try Cache First
        const cacheKey = CACHE_KEYS.BRANDING_COMPANY(companyId);
        const cached = await getCachedData(cacheKey);
        if (cached) {
            console.log(`[BRANDING] Company ${companyId} branding fetched from Redis cache`);
            return successResponse(cached, 'Company branding fetched (cached)');
        }

        const scope = await getUserTenantScope(userId);

        // Platform Admin can access any, Company Admin only their own
        if (scope.roleLevel < 5 && scope.companyId !== companyId) {
            return errorResponse('FORBIDDEN', 'Access denied', 403);
        }

        const { data: branding, error } = await core.companyBranding()
            .select('*')
            .eq('company_id', companyId)
            .is('deleted_at', null)
            .single();

        if (error && error.code !== 'PGRST116') {
            throw new Error(error.message);
        }

        const result = branding || {};

        // 2. Cache the result for 24 hours
        await cacheData(cacheKey, result, CACHE_TTL.BRANDING);

        return successResponse(result, 'Company branding fetched');
    } catch (error: any) {
        return errorResponse('INTERNAL_ERROR', error.message);
    }
}

/**
 * PUT /api/platform/branding/company/[companyId] - Update company branding
 */
export async function PUT(req: NextRequest, { params }: Params) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse('UNAUTHORIZED', 'Unauthorized', 401);

        const { deleteCachedData, CACHE_KEYS } = require('@/lib/redis');
        const companyId = parseInt(params.companyId);
        const scope = await getUserTenantScope(userId);

        // Platform Admin can update any, Company Admin only their own
        if (scope.roleLevel < 5 && scope.companyId !== companyId) {
            return errorResponse('FORBIDDEN', 'Access denied', 403);
        }

        const body = await req.json();
        const {
            logo_url,
            favicon_url,
            dark_logo_url,
            primary_color,
            secondary_color,
            accent_color,
            login_message,
            footer_text
        } = body;

        // Check if branding exists
        const { data: existing } = await core.companyBranding()
            .select('id')
            .eq('company_id', companyId)
            .is('deleted_at', null)
            .single();

        const updateData: Record<string, any> = {
            company_id: companyId,
            logo_url,
            favicon_url,
            dark_logo_url,
            primary_color,
            secondary_color,
            accent_color,
            login_message,
            footer_text,
            updated_by: userId
        };

        let result;
        if (existing) {
            // Update existing
            result = await core.companyBranding()
                .update(updateData)
                .eq('id', existing.id)
                .select()
                .single();
        } else {
            // Insert new
            updateData.created_by = userId;
            result = await core.companyBranding()
                .insert(updateData)
                .select()
                .single();
        }

        if (result.error) {
            throw new Error(result.error.message);
        }

        // 🛡️ INVALIDATE CACHE
        await deleteCachedData(CACHE_KEYS.BRANDING_COMPANY(companyId));
        console.log(`[BRANDING] Company ${companyId} branding cache invalidated after update`);

        // Log to audit
        const ipAddress = AuditService.getIP(req);
        const userAgent = req.headers.get('user-agent') || 'unknown';

        await AuditService.logAction({
            userId,
            action: existing ? 'UPDATE' : 'CREATE',
            tableName: 'company_branding',
            schemaName: 'core',
            recordId: String(result.data?.id || 0),
            newData: { ...updateData, company_id: companyId },
            ipAddress,
            userAgent,
            companyId
        });

        return successResponse(result.data, 'Company branding updated');
    } catch (error: any) {
        return errorResponse('INTERNAL_ERROR', error.message);
    }
}

/**
 * DELETE /api/platform/branding/company/[companyId] - Soft delete company branding
 */
export async function DELETE(req: NextRequest, { params }: Params) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse('UNAUTHORIZED', 'Unauthorized', 401);

        const { deleteCachedData, CACHE_KEYS } = require('@/lib/redis');
        const companyId = parseInt(params.companyId);
        const scope = await getUserTenantScope(userId);

        // Only Platform Admin can delete
        if (scope.roleLevel < 5) {
            return errorResponse('FORBIDDEN', 'Platform Admin access required', 403);
        }

        // Get delete reason from query
        const { searchParams } = new URL(req.url);
        const deleteReason = searchParams.get('reason') || 'Admin action';

        // Soft delete
        const { data, error } = await core.companyBranding()
            .update({
                deleted_at: new Date().toISOString(),
                deleted_by: userId,
                delete_reason: deleteReason
            })
            .eq('company_id', companyId)
            .is('deleted_at', null)
            .select()
            .single();

        if (error) {
            throw new Error(error.message);
        }

        // 🛡️ INVALIDATE CACHE
        await deleteCachedData(CACHE_KEYS.BRANDING_COMPANY(companyId));
        console.log(`[BRANDING] Company ${companyId} branding cache invalidated after delete`);

        // Log to audit
        const ipAddress = AuditService.getIP(req);
        const userAgent = req.headers.get('user-agent') || 'unknown';

        await AuditService.logAction({
            userId,
            action: 'SOFT_DELETE',
            tableName: 'company_branding',
            schemaName: 'core',
            recordId: String(data?.id || 0),
            newData: { company_id: companyId, delete_reason: deleteReason },
            ipAddress,
            userAgent,
            companyId
        });

        return successResponse({ success: true }, 'Company branding deleted');
    } catch (error: any) {
        return errorResponse('INTERNAL_ERROR', error.message);
    }
}
