import { NextRequest } from 'next/server';
import { app_auth } from '@/lib/supabase';
import { successResponse, errorResponse } from '@/lib/errorHandler';
import { getUserIdFromToken } from '@/lib/jwt';
import { getUserTenantScope } from '@/middleware/tenantFilter';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * AUTH: Audit Logs API
 * Fetch security events with multi-tenant filtering
 */
export async function GET(req: NextRequest) {
    try {
        // 🔑 1. Security Check
        const userId = await getUserIdFromToken(req);
        if (!userId) {
            console.error('❌ [API AUDIT] Unauthorized: No token or zero ID');
            return errorResponse('UNAUTHORIZED', 'Session expired', 401);
        }

        // 🛡️ 2. Context Discovery
        let scope;
        try {
            scope = await getUserTenantScope(userId);
        } catch (e) {
            console.error('❌ [API AUDIT] Scope Resolution Failed:', e);
            return errorResponse('FORBIDDEN', 'Access scope could not be verified', 403);
        }

        const { searchParams } = new URL(req.url);
        const companyIdFilter = searchParams.get('companyId');

        // 📊 3. Stream Engine
        let query = app_auth.auditLogs().select('*', { count: 'exact' });

        // Multi-Tenant Isolation
        if (scope.roleLevel < 5) {
            // Level < 5 users can ONLY see their own company logs
            if (!scope.companyId) {
                return errorResponse('FORBIDDEN', 'Company isolation required', 403);
            }
            query = query.eq('company_id', scope.companyId);
        } else if (companyIdFilter) {
            // Platform Admin explicitly filtering by company
            query = query.eq('company_id', companyIdFilter);
        }

        // 🚀 4. Execute Handshake
        const { data, error, count } = await query
            .order('created_at', { ascending: false })
            .limit(100); // Tighter limit for performance

        if (error) {
            console.error('❌ [API AUDIT] Supabase Error:', error.message);
            return errorResponse('DATABASE_ERROR', error.message, 500);
        }

        return successResponse(data || [], `Registry synchronized: ${data?.length || 0} items retrieved`, 200, { total: count });

    } catch (error: any) {
        console.error('❌ [API AUDIT] Fatal Exception:', error.message);
        return errorResponse('INTERNAL_ERROR', error.message || 'Stream sync failed', 500);
    }
}
