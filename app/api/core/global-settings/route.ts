/**
 * CORE API - Global Settings (Platform Admin Only)
 * Route: /api/core/global-settings
 */

import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/errorHandler';
import { core } from '@/lib/supabase';
import { getUserIdFromToken } from '@/lib/jwt';
import { getUserTenantScope } from '@/middleware/tenantFilter';
import { AuditService } from '@/lib/services/AuditService';

export async function GET(_req: NextRequest) {
    try {
        const { data, error } = await core.globalSettings()
            .select('*')
            .order('group');

        if (error) return errorResponse('DATABASE_ERROR', error.message, 500);

        // 🛡️ High-Verbosity Audit (Tracks who is reading system parameters)
        try {
            const userId = await getUserIdFromToken(_req);
            if (userId) {
                await AuditService.logAction({
                    userId,
                    action: 'VIEW',
                    tableName: 'global_settings',
                    schemaName: 'core',
                    ipAddress: AuditService.getIP(_req),
                });
            }
        } catch (e) { /* Bypass audit if token fails on READ */ }

        return successResponse(data, 'Global settings fetched successfully');
    } catch (error: any) {
        return errorResponse('INTERNAL_SERVER_ERROR', error.message || 'Failed to fetch settings', 500);
    }
}

export async function POST(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse('UNAUTHORIZED', 'Authentication required', 401);

        const scope = await getUserTenantScope(userId);

        // Only Platform Admin (Level 5) can modify global settings
        if (scope.roleLevel < 5) {
            return errorResponse('FORBIDDEN', 'Only Platform Admin can manage global settings', 403);
        }

        const body = await req.json();
        const settings = Array.isArray(body) ? body : [body];

        for (const item of settings) {
            if (!item.key) return errorResponse('VALIDATION_ERROR', 'Key is required for each setting', 400);
        }

        const { data, error } = await core.globalSettings()
            .upsert(settings.map(s => ({
                ...s,
                updated_at: new Date().toISOString(),
                updated_by: userId
            })), { onConflict: 'key' })
            .select();

        if (error) return errorResponse('DATABASE_ERROR', error.message, 500);

        // Audit Log for system settings change
        await AuditService.logAction({
            userId,
            action: 'SYNC_SETTINGS',
            tableName: 'global_settings',
            schemaName: 'core',
            newData: settings,
            ipAddress: AuditService.getIP(req),
            userAgent: req.headers.get('user-agent') || 'unknown'
        });

        return successResponse(data, 'Global settings synchronized');
    } catch (err: any) {
        return errorResponse('INTERNAL_SERVER_ERROR', err.message, 500);
    }
}
