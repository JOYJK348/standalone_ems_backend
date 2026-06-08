import { NextRequest } from 'next/server';
import { core, app_auth, supabase } from '@/lib/supabase';
import { getUserIdFromToken } from '@/lib/jwt';
import { getUserTenantScope } from '@/middleware/tenantFilter';
import { successResponse, errorResponse } from '@/lib/errorHandler';

export const dynamic = 'force-dynamic';

/**
 * GET /api/platform/usage
 * Get current usage stats for the company (users, employees, branches, departments, designations)
 */
export async function GET(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse('UNAUTHORIZED', 'Authentication required', 401);

        const scope = await getUserTenantScope(userId);
        if (!scope.companyId) {
            return errorResponse('FORBIDDEN', 'Company context required', 403);
        }

        // 1. Get Company Details
        const { data: company, error: companyError } = await supabase
            .schema('core')
            .from('companies')
            .select('*')
            .eq('id', scope.companyId)
            .single();

        if (companyError) throw companyError;

        // 2. Resolve Plan Template for Limits (Cross-reference by plan name/type)
        // This ensures predefined plans like 'ENTERPRISE' get their correct 'Unlimited' (0) status
        const { data: template } = await supabase
            .schema('core')
            .from('subscription_templates')
            .select('*')
            .eq('plan_type', company.subscription_plan)
            .maybeSingle();

        // Priority Logic:
        // - If a master template exists, use its limits
        // - Otherwise, fallback to the values stored on the company record itself
        const finalLimits = {
            max_users: template ? template.max_users : (company.max_users ?? 10),
            max_employees: template ? template.max_employees : (company.max_employees ?? 10),
            max_branches: template ? template.max_branches : (company.max_branches ?? 1),
            max_departments: template ? template.max_departments : (company.max_departments ?? 5),
            max_designations: template ? template.max_designations : (company.max_designations ?? 5),
        };

        // 3. Count active resources for the company
        const [usersResult, employeesResult, branchesResult, departmentsResult, designationsResult] = await Promise.all([
            // Count users with roles in this company
            supabase.schema('app_auth').from('user_roles')
                .select('id', { count: 'exact', head: true })
                .eq('company_id', scope.companyId)
                .eq('is_active', true),

            // Count employees
            supabase.schema('core').from('employees')
                .select('id', { count: 'exact', head: true })
                .eq('company_id', scope.companyId)
                .eq('is_active', true)
                .is('deleted_at', null),

            // Count branches
            supabase.schema('core').from('branches')
                .select('id', { count: 'exact', head: true })
                .eq('company_id', scope.companyId)
                .eq('is_active', true)
                .is('deleted_at', null),

            // Count departments
            supabase.schema('core').from('departments')
                .select('id', { count: 'exact', head: true })
                .eq('company_id', scope.companyId)
                .eq('is_active', true)
                .is('deleted_at', null),

            // Count designations
            supabase.schema('core').from('designations')
                .select('id', { count: 'exact', head: true })
                .eq('company_id', scope.companyId)
                .eq('is_active', true)
                .is('deleted_at', null)
        ]);

        const usageData = {
            company: company, // Added full company context for dashboard consistency
            subscription_plan: company.subscription_plan,

            // Evaluated Limits
            max_users: finalLimits.max_users,
            max_employees: finalLimits.max_employees,
            max_branches: finalLimits.max_branches,
            max_departments: finalLimits.max_departments,
            max_designations: finalLimits.max_designations,

            // Active counts
            active_users: usersResult.count || 0,
            active_employees: employeesResult.count || 0,
            active_branches: branchesResult.count || 0,
            active_departments: departmentsResult.count || 0,
            active_designations: designationsResult.count || 0
        };

        return successResponse(usageData, 'Usage and limits fetched successfully');
    } catch (err: any) {
        return errorResponse('INTERNAL_SERVER_ERROR', err.message, 500);
    }
}
