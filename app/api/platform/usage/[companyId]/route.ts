import { NextRequest } from 'next/server';
import { core, app_auth, supabase } from '@/lib/supabase';
import { getUserIdFromToken } from '@/lib/jwt';
import { getUserTenantScope } from '@/middleware/tenantFilter';
import { successResponse, errorResponse } from '@/lib/errorHandler';

export const dynamic = 'force-dynamic';

/**
 * GET /api/platform/usage/[companyId]
 * Explicitly get current usage stats for a specific company
 */
export async function GET(req: NextRequest, { params }: { params: { companyId: string } }) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse('UNAUTHORIZED', 'Authentication required', 401);

        const targetCompanyId = params.companyId;

        if (!targetCompanyId || isNaN(Number(targetCompanyId)) || Number(targetCompanyId) === 0) {
            return successResponse({
                company: { id: 0, name: 'Platform Administration' },
                subscription_plan: 'PLATFORM',
                max_users: 0, max_employees: 0, max_branches: 0, max_departments: 0, max_designations: 0,
                active_users: 1, active_employees: 0, active_branches: 0, active_departments: 0, active_designations: 0
            }, 'Platform usage returned');
        }

        // Get scope but tell it we prefer THIS specific company
        const scope = await getUserTenantScope(userId, undefined, targetCompanyId);

        // Security check: If not platform admin, must belong to this company
        if (scope.roleLevel < 5 && String(scope.companyId) !== String(targetCompanyId)) {
            return errorResponse('FORBIDDEN', 'Permission Denied: Cannot access data for other companies', 403);
        }

        // 1. Get Company Details
        const { data: company, error: companyError } = await supabase
            .schema('core')
            .from('companies')
            .select('*')
            .eq('id', targetCompanyId)
            .single();

        if (companyError) throw companyError;

        // 2. Resolve Plan Template for Limits
        const { data: template } = await supabase
            .schema('core')
            .from('subscription_templates')
            .select('*')
            .eq('plan_type', company.subscription_plan)
            .maybeSingle();

        // 2. Resolve Plan Template for Limits
        const finalLimits = {
            max_users: template ? template.max_users : (company.max_users ?? 10),
            max_employees: template ? template.max_employees : (company.max_employees ?? 10),
            max_branches: template ? template.max_branches : (company.max_branches ?? 1),
            max_departments: template ? template.max_departments : (company.max_departments ?? 5),
            max_designations: template ? template.max_designations : (company.max_designations ?? 5),
        };

        console.log(`[Usage API] targetCompanyId: ${targetCompanyId}, scopeCompanyId: ${scope.companyId}`);

        // 3. Count active resources
        const [usersResult, employeesResult, branchesResult, departmentsResult, designationsResult] = await Promise.all([
            // Use explicit schema context to avoid any default schema shadowing
            supabase.schema('app_auth').from('user_roles')
                .select('id', { count: 'exact', head: true })
                .eq('company_id', targetCompanyId)
                .eq('is_active', true),

            supabase.schema('core').from('employees')
                .select('id', { count: 'exact', head: true })
                .eq('company_id', targetCompanyId)
                .eq('is_active', true)
                .is('deleted_at', null),

            supabase.schema('core').from('branches')
                .select('id', { count: 'exact', head: true })
                .eq('company_id', targetCompanyId)
                .eq('is_active', true)
                .is('deleted_at', null),

            supabase.schema('core').from('departments')
                .select('id', { count: 'exact', head: true })
                .eq('company_id', targetCompanyId)
                .eq('is_active', true)
                .is('deleted_at', null),

            supabase.schema('core').from('designations')
                .select('id', { count: 'exact', head: true })
                .eq('company_id', targetCompanyId)
                .eq('is_active', true)
                .is('deleted_at', null)
        ]);

        const usageData = {
            company: company, // Added full company context for dashboard
            subscription_plan: company.subscription_plan,
            max_users: finalLimits.max_users,
            max_employees: finalLimits.max_employees,
            max_branches: finalLimits.max_branches,
            max_departments: finalLimits.max_departments,
            max_designations: finalLimits.max_designations,
            active_users: usersResult.count || 0,
            active_employees: employeesResult.count || 0,
            active_branches: branchesResult.count || 0,
            active_departments: departmentsResult.count || 0,
            active_designations: designationsResult.count || 0
        };

        console.log('[Usage API] Results:', JSON.stringify(usageData, null, 2));

        return successResponse(usageData, 'Explicit company usage fetched');
    } catch (err: any) {
        return errorResponse('INTERNAL_SERVER_ERROR', err.message, 500);
    }
}
