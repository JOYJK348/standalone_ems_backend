import { NextRequest } from 'next/server';
import { core, app_auth } from '@/lib/supabase';
import { getUserIdFromToken } from '@/lib/jwt';
import { getUserTenantScope } from '@/middleware/tenantFilter';
import { successResponse, errorResponse } from '@/lib/errorHandler';

// Plan limits lookup
const PLAN_LIMITS: Record<string, Record<string, number>> = {
    'TRIAL': { user: 10, employee: 10, branch: 1, department: 5, designation: 5 },
    'BASIC': { user: 25, employee: 25, branch: 3, department: 10, designation: 10 },
    'STANDARD': { user: 100, employee: 100, branch: 5, department: 25, designation: 25 },
    'ENTERPRISE': { user: 0, employee: 0, branch: 0, department: 0, designation: 0 }, // 0 = Unlimited
};

/**
 * GET /api/platform/can-add?resource_type=user|employee|branch|department|designation
 * Check if the company can add more of a specific resource type
 */
export async function GET(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse('UNAUTHORIZED', 'Authentication required', 401);

        const scope = await getUserTenantScope(userId);
        if (!scope.companyId) {
            return errorResponse('FORBIDDEN', 'Company context required', 403);
        }

        const resourceType = req.nextUrl.searchParams.get('resource_type');
        if (!resourceType || !['user', 'employee', 'branch', 'department', 'designation'].includes(resourceType)) {
            return errorResponse('VALIDATION_ERROR', 'Valid resource_type is required: user, employee, branch, department, designation', 400);
        }

        // Get company's current plan
        const { data: company, error: companyError } = await core.companies()
            .select('subscription_plan')
            .eq('id', scope.companyId)
            .single();

        if (companyError) {
            return errorResponse('DATABASE_ERROR', companyError.message, 500);
        }

        const planName = company?.subscription_plan || 'TRIAL';
        const limits = PLAN_LIMITS[planName] || PLAN_LIMITS['TRIAL'];
        const maxAllowed = limits[resourceType];

        // If unlimited (0), always allow
        if (maxAllowed === 0) {
            return successResponse({
                allowed: true,
                current: 0,
                max: 0, // 0 means unlimited
                remaining: -1, // -1 indicates unlimited
                message: `Unlimited ${resourceType}s allowed on ${planName} plan`
            });
        }

        // Count current usage
        let currentCount = 0;
        switch (resourceType) {
            case 'user':
                const { count: userCount } = await app_auth.userRoles()
                    .select('id', { count: 'exact', head: true })
                    .eq('company_id', scope.companyId)
                    .eq('is_active', true);
                currentCount = userCount || 0;
                break;
            case 'employee':
                const { count: empCount } = await core.employees()
                    .select('id', { count: 'exact', head: true })
                    .eq('company_id', scope.companyId)
                    .eq('is_active', true)
                    .is('deleted_at', null);
                currentCount = empCount || 0;
                break;
            case 'branch':
                const { count: branchCount } = await core.branches()
                    .select('id', { count: 'exact', head: true })
                    .eq('company_id', scope.companyId)
                    .eq('is_active', true)
                    .is('deleted_at', null);
                currentCount = branchCount || 0;
                break;
            case 'department':
                const { count: deptCount } = await core.departments()
                    .select('id', { count: 'exact', head: true })
                    .eq('company_id', scope.companyId)
                    .eq('is_active', true)
                    .is('deleted_at', null);
                currentCount = deptCount || 0;
                break;
            case 'designation':
                const { count: desigCount } = await core.designations()
                    .select('id', { count: 'exact', head: true })
                    .eq('company_id', scope.companyId)
                    .eq('is_active', true)
                    .is('deleted_at', null);
                currentCount = desigCount || 0;
                break;
        }

        const allowed = currentCount < maxAllowed;
        const remaining = Math.max(0, maxAllowed - currentCount);

        return successResponse({
            allowed,
            current: currentCount,
            max: maxAllowed,
            remaining,
            message: allowed
                ? `You can add ${remaining} more ${resourceType}(s)`
                : `You have reached the maximum limit of ${maxAllowed} ${resourceType}(s) for your ${planName} plan. Upgrade to add more.`
        });
    } catch (err: any) {
        return errorResponse('INTERNAL_SERVER_ERROR', err.message, 500);
    }
}
