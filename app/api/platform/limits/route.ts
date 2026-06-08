import { NextRequest } from 'next/server';
import { core } from '@/lib/supabase';
import { getUserIdFromToken } from '@/lib/jwt';
import { getUserTenantScope } from '@/middleware/tenantFilter';
import { successResponse, errorResponse } from '@/lib/errorHandler';

// Default plan limits configuration
const PLAN_LIMITS: Record<string, any> = {
    'TRIAL': {
        plan_name: 'TRIAL',
        display_name: 'Trial Plan',
        max_users: 10,
        max_employees: 10,
        max_branches: 1,
        max_departments: 5,
        max_designations: 5,
        enabled_modules: ['EMS', 'LMS', 'ATTENDANCE', 'LIVE_CLASSES', 'ASSESSMENTS', 'MATERIALS'],
        trial_days: 30,
        support_level: 'EMAIL'
    },
    'BASIC': {
        plan_name: 'BASIC',
        display_name: 'Basic Plan',
        max_users: 25,
        max_employees: 25,
        max_branches: 3,
        max_departments: 10,
        max_designations: 10,
        enabled_modules: ['EMS', 'LMS', 'ATTENDANCE', 'LIVE_CLASSES', 'ASSESSMENTS', 'MATERIALS'],
        trial_days: 0,
        support_level: 'EMAIL'
    },
    'STANDARD': {
        plan_name: 'STANDARD',
        display_name: 'Standard Plan',
        max_users: 100,
        max_employees: 100,
        max_branches: 5,
        max_departments: 25,
        max_designations: 25,
        enabled_modules: ['EMS', 'LMS', 'ATTENDANCE', 'LIVE_CLASSES', 'ASSESSMENTS', 'MATERIALS'],
        trial_days: 0,
        support_level: 'PRIORITY'
    },
    'ENTERPRISE': {
        plan_name: 'ENTERPRISE',
        display_name: 'Enterprise Plan',
        max_users: 0, // 0 = Unlimited
        max_employees: 0,
        max_branches: 0,
        max_departments: 0,
        max_designations: 0,
        enabled_modules: ['EMS', 'LMS', 'ATTENDANCE', 'LIVE_CLASSES', 'ASSESSMENTS', 'MATERIALS'],
        trial_days: 0,
        support_level: '24X7'
    }
};

/**
 * GET /api/platform/limits
 * Get plan limits for the current company's subscription
 */
export async function GET(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse('UNAUTHORIZED', 'Authentication required', 401);

        const scope = await getUserTenantScope(userId);
        if (!scope.companyId) {
            return errorResponse('FORBIDDEN', 'Company context required', 403);
        }

        // Get company's subscription plan
        const { data: company, error: companyError } = await core.companies()
            .select('subscription_plan, subscription_start_date, subscription_end_date, enabled_modules, trial_started_at, trial_expired')
            .eq('id', scope.companyId)
            .single();

        if (companyError) {
            return errorResponse('DATABASE_ERROR', companyError.message, 500);
        }

        const planName = company?.subscription_plan || 'TRIAL';

        // First try to get limits from database
        const { data: dbPlan } = await core.subscriptionPlans()
            .select('*')
            .eq('name', planName)
            .single();

        let limits;
        if (dbPlan && dbPlan.max_users !== undefined) {
            limits = {
                plan_name: dbPlan.name,
                display_name: dbPlan.display_name,
                max_users: dbPlan.max_users || 0,
                max_employees: dbPlan.max_employees || 0,
                max_branches: dbPlan.max_branches || 0,
                max_departments: dbPlan.max_departments || 0,
                max_designations: dbPlan.max_designations || 0,
                enabled_modules: dbPlan.enabled_modules || [],
                trial_days: dbPlan.trial_days || 0,
                support_level: dbPlan.support_level || 'EMAIL'
            };
        } else {
            // Fallback to hardcoded limits
            limits = PLAN_LIMITS[planName] || PLAN_LIMITS['TRIAL'];
        }

        // Add company-specific info
        const result = {
            ...limits,
            subscription_start_date: company?.subscription_start_date,
            subscription_end_date: company?.subscription_end_date,
            trial_started_at: company?.trial_started_at,
            trial_expired: company?.trial_expired || false
        };

        return successResponse(result, 'Plan limits fetched successfully');
    } catch (err: any) {
        return errorResponse('INTERNAL_SERVER_ERROR', err.message, 500);
    }
}
