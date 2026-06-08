/**
 * EMERGENCY FIX - Update Enterprise Plan Limits
 * Route: /api/platform/fix-enterprise-limits
 * This is a one-time migration endpoint
 */

import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/errorHandler';
import { supabase } from '@/lib/supabase';
import { getUserIdFromToken } from '@/lib/jwt';
import { getUserTenantScope } from '@/middleware/tenantFilter';

export async function POST(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse('UNAUTHORIZED', 'Unauthorized', 401);

        const scope = await getUserTenantScope(userId);

        // Only Platform Admin can run this
        if (scope.roleLevel < 5) {
            return errorResponse('FORBIDDEN', 'Only Platform Admin can run this migration', 403);
        }

        // Update all ENTERPRISE plan companies to have unlimited (0) limits
        const { data, error } = await supabase
            .schema('core')
            .from('companies')
            .update({
                max_users: 0,
                max_employees: 0,
                max_branches: 0,
                max_departments: 0,
                max_designations: 0,
                updated_at: new Date().toISOString()
            })
            .eq('subscription_plan', 'ENTERPRISE')
            .select();

        if (error) throw error;

        return successResponse(
            { updated_companies: data?.length || 0, companies: data },
            `Successfully updated ${data?.length || 0} Enterprise companies to unlimited limits`
        );

    } catch (error: any) {
        return errorResponse('INTERNAL_ERROR', error.message, 500);
    }
}
