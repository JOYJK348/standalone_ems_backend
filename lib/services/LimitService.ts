/**
 * Plan Limit Enforcement Service
 * Checks if a company can add more resources based on their subscription plan
 */

import { core, app_auth, supabaseService } from '@/lib/supabase';

export type ResourceType = 'user' | 'employee' | 'branch' | 'department' | 'designation';

export interface LimitCheckResult {
    allowed: boolean;
    current: number;
    max: number;
    remaining: number;
    message: string;
    planName: string;
}

/**
 * Check if company can add more of a specific resource
 */
export async function canAddResource(
    companyId: number | string,
    resourceType: ResourceType
): Promise<LimitCheckResult> {
    try {
        // 1. Get company's current status and custom overrides
        const { data: company, error: companyError } = await core.companies()
            .select('subscription_plan, max_users, max_employees, max_branches, max_departments, max_designations')
            .eq('id', companyId)
            .single();

        if (companyError || !company) {
            return {
                allowed: false,
                current: 0,
                max: 0,
                remaining: 0,
                message: 'Company not found',
                planName: 'UNKNOWN'
            };
        }

        const planName = company.subscription_plan || 'TRIAL';

        // 2. Fetch Plan Metadata DYNAMICALLY from database
        const { data: planMetadata } = await supabaseService
            .schema('core')
            .from('subscription_plans')
            .select('user_limit, employee_limit, branch_limit, department_limit, designation_limit')
            .eq('code', planName)
            .single();

        // Fallback to safe defaults if plan metadata is missing from DB
        const defaultLimits = planMetadata ? {
            user: planMetadata.user_limit,
            employee: planMetadata.employee_limit,
            branch: planMetadata.branch_limit,
            department: planMetadata.department_limit,
            designation: planMetadata.designation_limit
        } : { user: 10, employee: 10, branch: 3, department: 10, designation: 10 };

        // Use company-specific overrides if set, otherwise use plan defaults
        let maxAllowed: number;
        switch (resourceType) {
            case 'user':
                maxAllowed = company.max_users ?? defaultLimits.user;
                break;
            case 'employee':
                maxAllowed = company.max_employees ?? defaultLimits.employee;
                break;
            case 'branch':
                maxAllowed = company.max_branches ?? defaultLimits.branch;
                break;
            case 'department':
                maxAllowed = company.max_departments ?? defaultLimits.department;
                break;
            case 'designation':
                maxAllowed = company.max_designations ?? defaultLimits.designation;
                break;
            default:
                maxAllowed = 0;
        }

        // If unlimited (0), always allow
        if (maxAllowed === 0) {
            return {
                allowed: true,
                current: 0,
                max: 0,
                remaining: -1, // -1 indicates unlimited
                message: `Unlimited ${resourceType}s allowed`,
                planName
            };
        }

        // 2. Count current usage
        let currentCount = 0;
        switch (resourceType) {
            case 'user':
                const { count: userCount } = await app_auth.userRoles()
                    .select('id', { count: 'exact', head: true })
                    .eq('company_id', companyId)
                    .eq('is_active', true);
                currentCount = userCount || 0;
                break;
            case 'employee':
                const { count: empCount } = await core.employees()
                    .select('id', { count: 'exact', head: true })
                    .eq('company_id', companyId)
                    .eq('is_active', true)
                    .is('deleted_at', null);
                currentCount = empCount || 0;
                break;
            case 'branch':
                const { count: branchCount } = await core.branches()
                    .select('id', { count: 'exact', head: true })
                    .eq('company_id', companyId)
                    .eq('is_active', true)
                    .is('deleted_at', null);
                currentCount = branchCount || 0;
                break;
            case 'department':
                const { count: deptCount } = await core.departments()
                    .select('id', { count: 'exact', head: true })
                    .eq('company_id', companyId)
                    .eq('is_active', true)
                    .is('deleted_at', null);
                currentCount = deptCount || 0;
                break;
            case 'designation':
                const { count: desigCount } = await core.designations()
                    .select('id', { count: 'exact', head: true })
                    .eq('company_id', companyId)
                    .eq('is_active', true)
                    .is('deleted_at', null);
                currentCount = desigCount || 0;
                break;
        }

        const allowed = currentCount < maxAllowed;
        const remaining = Math.max(0, maxAllowed - currentCount);

        return {
            allowed,
            current: currentCount,
            max: maxAllowed,
            remaining,
            planName,
            message: allowed
                ? `You can add ${remaining} more ${resourceType}(s)`
                : `You have reached the maximum limit of ${maxAllowed} ${resourceType}(s) for your ${planName} plan. Please upgrade to add more.`
        };
    } catch (error: any) {
        console.error('[LimitService] Error checking limits:', error);
        return {
            allowed: false,
            current: 0,
            max: 0,
            remaining: 0,
            message: 'Error checking limits',
            planName: 'UNKNOWN'
        };
    }
}

/**
 * Check if a module is enabled for the company
 */
export async function isModuleEnabled(
    companyId: number | string,
    moduleName: string
): Promise<boolean> {
    try {
        const { data: company } = await core.companies()
            .select('enabled_modules')
            .eq('id', companyId)
            .single();

        if (!company?.enabled_modules) return false;

        const modules = Array.isArray(company.enabled_modules)
            ? company.enabled_modules
            : JSON.parse(company.enabled_modules as string || '[]');

        return modules.includes(moduleName) || modules.includes('CORE');
    } catch (error) {
        console.error('[LimitService] Error checking module:', error);
        return false;
    }
}

/**
 * Check if trial has expired
 */
export async function isTrialExpired(companyId: number | string): Promise<boolean> {
    try {
        const { data: company } = await core.companies()
            .select('subscription_plan, subscription_end_date, trial_expired')
            .eq('id', companyId)
            .single();

        if (!company) return true;
        if (company.trial_expired) return true;
        if (company.subscription_plan !== 'TRIAL') return false;

        if (company.subscription_end_date) {
            const endDate = new Date(company.subscription_end_date);
            return new Date() > endDate;
        }

        return false;
    } catch (error) {
        console.error('[LimitService] Error checking trial:', error);
        return false;
    }
}
