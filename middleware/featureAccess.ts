/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * SUBSCRIPTION-BASED FEATURE ACCESS CONTROL
 * Agaran Innovations Private Limited
 * Enterprise SaaS | Zero-Noise UI | Professional Grade
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 
 * CORE PRINCIPLE:
 * - Company sees ONLY what they subscribed to
 * - No disabled menus
 * - No "access denied" pages
 * - If not subscribed → feature doesn't exist in UI
 * 
 * USAGE:
 * ```typescript
 * const access = await getCompanyFeatureAccess(userId);
 * if (access.hasModule('CRM')) {
 *   // Show CRM features
 * }
 * ```
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 */

import { supabase, core } from '@/lib/supabase';
import { getUserTenantScope, TenantScope } from './tenantFilter';
import { logger } from '@/lib/logger';
import { featureAccessCache } from '@/lib/cache/featureAccessCache';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TYPES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type ModuleType = 'CORE' | 'EMS';

export interface CompanyFeatureAccess {
    companyId: number;
    companyName: string;
    subscriptionPlan: string;
    subscriptionStatus: string;
    enabledModules: ModuleType[];
    limits: {
        maxUsers: number;
        maxBranches: number;
        maxEmployees: number;
        maxDepartments: number;
        maxDesignations: number;
    };
    isPlatformAdmin: boolean;

    // Helper methods
    hasModule: (module: ModuleType) => boolean;
    hasAnyModule: (modules: ModuleType[]) => boolean;
    hasAllModules: (modules: ModuleType[]) => boolean;
    canCreateBranch: () => Promise<boolean>;
    canCreateEmployee: () => Promise<boolean>;
    canCreateDepartment: () => Promise<boolean>;
    canCreateDesignation: () => Promise<boolean>;
}

export interface FeatureCheckResult {
    allowed: boolean;
    reason?: string;
    upgradeRequired?: boolean;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CORE FUNCTIONS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Get complete feature access information for a user's company
 * This is the MAIN function to check what features are available
 */
export async function getCompanyFeatureAccess(userId: number): Promise<CompanyFeatureAccess> {
    // Check cache first
    const cached = featureAccessCache.get(userId);
    if (cached) return cached;

    try {
        // Get user's tenant scope
        const scope = await getUserTenantScope(userId);

        // Platform Admin: Full access to everything
        if (scope.roleLevel >= 5) {
            const adminAccess = createPlatformAdminAccess();
            featureAccessCache.set(userId, adminAccess);
            return adminAccess;
        }

        // Company users: Get company subscription details
        if (!scope.companyId) {
            throw new Error('User has no company assignment');
        }

        const { data: company, error } = await core.companies()
            .select('id, name, subscription_plan, subscription_status, enabled_modules, max_users, max_branches, max_employees, max_departments, max_designations')
            .eq('id', scope.companyId)
            .single();

        if (error || !company) {
            logger.error('[FeatureAccess] Failed to fetch company details', {
                userId,
                companyId: scope.companyId,
                error: error?.message
            });
            throw new Error('Failed to fetch company subscription details');
        }

        // Build feature access object
        const enabledModules = (company.enabled_modules || ['CORE', 'EMS']) as ModuleType[];

        const access: CompanyFeatureAccess = {
            companyId: company.id,
            companyName: company.name,
            subscriptionPlan: company.subscription_plan || 'TRIAL',
            subscriptionStatus: company.subscription_status || 'ACTIVE',
            enabledModules,
            limits: {
                maxUsers: company.max_users || 0,
                maxBranches: company.max_branches || 0,
                maxEmployees: company.max_employees || 0,
                maxDepartments: company.max_departments || 0,
                maxDesignations: company.max_designations || 0,
            },
            isPlatformAdmin: false,

            // Helper methods
            hasModule: (module: ModuleType) => enabledModules.includes(module),
            hasAnyModule: (modules: ModuleType[]) => modules.some(m => enabledModules.includes(m)),
            hasAllModules: (modules: ModuleType[]) => modules.every(m => enabledModules.includes(m)),
            canCreateBranch: async () => await checkBranchLimit(company.id, company.max_branches || 0),
            canCreateEmployee: async () => await checkEmployeeLimit(company.id, company.max_employees || 0),
            canCreateDepartment: async () => await checkDepartmentLimit(company.id, company.max_departments || 0),
            canCreateDesignation: async () => await checkDesignationLimit(company.id, company.max_designations || 0),
        };

        // Cache for 5 minutes
        featureAccessCache.set(userId, access);

        logger.info('[FeatureAccess] Feature access loaded', {
            userId,
            companyId: company.id,
            enabledModules,
            plan: company.subscription_plan
        });

        return access;

    } catch (error: any) {
        console.error('❌ [FeatureAccess] CRITICAL ERROR in getCompanyFeatureAccess:', {
            userId,
            message: error.message,
            stack: error.stack
        });
        throw error;
    }
}

/**
 * Check if user has access to a specific module
 * Use this in API routes to enforce feature access
 */
export async function requireModuleAccess(
    userId: number,
    requiredModule: ModuleType
): Promise<void> {
    const access = await getCompanyFeatureAccess(userId);

    if (!access.hasModule(requiredModule)) {
        logger.warn('[FeatureAccess] Module access denied', {
            userId,
            companyId: access.companyId,
            requiredModule,
            enabledModules: access.enabledModules
        });

        throw new Error(
            `Access Denied: The ${requiredModule} module is not enabled for your subscription. ` +
            `Please contact your administrator to upgrade your plan.`
        );
    }
}

/**
 * Check if user has access to any of the specified modules
 */
export async function requireAnyModuleAccess(
    userId: number,
    requiredModules: ModuleType[]
): Promise<void> {
    const access = await getCompanyFeatureAccess(userId);

    if (!access.hasAnyModule(requiredModules)) {
        logger.warn('[FeatureAccess] No matching module access', {
            userId,
            companyId: access.companyId,
            requiredModules,
            enabledModules: access.enabledModules
        });

        throw new Error(
            `Access Denied: None of the required modules (${requiredModules.join(', ')}) are enabled for your subscription.`
        );
    }
}

/**
 * Get filtered menu items based on company's enabled modules
 * This is used by frontend to show only relevant menus
 */
const menuCache = new Map<number, { ids: number[]; expiresAt: number }>();
const MENU_CACHE_TTL = 5 * 60 * 1000;

export async function getAccessibleMenus(userId: number): Promise<number[]> {
    // Check menu cache
    const menuCached = menuCache.get(userId);
    if (menuCached && Date.now() < menuCached.expiresAt) return menuCached.ids;

    try {
        const access = await getCompanyFeatureAccess(userId);

        // Platform Admin: Get all menus
        if (access.isPlatformAdmin) {
            const { data: allMenus } = await supabase
                .schema('app_auth' as any)
                .from('menu_registry')
                .select('id')
                .eq('is_active', true);

            const ids = allMenus?.map(m => m.id) || [];
            menuCache.set(userId, { ids, expiresAt: Date.now() + MENU_CACHE_TTL });
            return ids;
        }

        // Company users: Filter by enabled modules
        const { data: company } = await core.companies()
            .select('allowed_menu_ids')
            .eq('id', access.companyId)
            .single();

        const allowedMenuIds = company?.allowed_menu_ids || [];

        // Further filter menus based on enabled modules
        const { data: menus } = await supabase
            .schema('app_auth' as any)
            .from('menu_registry')
            .select('id, module_key')
            .in('id', allowedMenuIds)
            .eq('is_active', true);

        if (!menus) return [];

        // Filter menus by enabled modules
        const accessibleMenus = menus.filter(menu => {
            if (!menu.module_key) return true; // Core menus always visible
            return access.hasModule(menu.module_key as ModuleType);
        });

        const ids = accessibleMenus.map(m => m.id);
        menuCache.set(userId, { ids, expiresAt: Date.now() + MENU_CACHE_TTL });
        return ids;

    } catch (error: any) {
        logger.error('[FeatureAccess] Error getting accessible menus', {
            userId,
            error: error.message
        });
        return [];
    }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// LIMIT CHECKING FUNCTIONS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function checkBranchLimit(companyId: number, maxBranches: number): Promise<boolean> {
    if (maxBranches === 0) return true; // Unlimited

    const { count } = await core.branches()
        .select('*', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .is('deleted_at', null);

    return (count || 0) < maxBranches;
}

async function checkEmployeeLimit(companyId: number, maxEmployees: number): Promise<boolean> {
    if (maxEmployees === 0) return true; // Unlimited

    const { count } = await core.employees()
        .select('*', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .is('deleted_at', null);

    return (count || 0) < maxEmployees;
}

async function checkDepartmentLimit(companyId: number, maxDepartments: number): Promise<boolean> {
    if (maxDepartments === 0) return true; // Unlimited

    const { count } = await core.departments()
        .select('*', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .is('deleted_at', null);

    return (count || 0) < maxDepartments;
}

async function checkDesignationLimit(companyId: number, maxDesignations: number): Promise<boolean> {
    if (maxDesignations === 0) return true; // Unlimited

    const { count } = await core.designations()
        .select('*', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .is('deleted_at', null);

    return (count || 0) < maxDesignations;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HELPER FUNCTIONS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function createPlatformAdminAccess(): CompanyFeatureAccess {
    const allModules: ModuleType[] = ['CORE', 'EMS'];

    return {
        companyId: 0,
        companyName: 'Platform Administration',
        subscriptionPlan: 'PLATFORM',
        subscriptionStatus: 'ACTIVE',
        enabledModules: allModules,
        limits: {
            maxUsers: 0,
            maxBranches: 0,
            maxEmployees: 0,
            maxDepartments: 0,
            maxDesignations: 0,
        },
        isPlatformAdmin: true,
        hasModule: () => true,
        hasAnyModule: () => true,
        hasAllModules: () => true,
        canCreateBranch: async () => true,
        canCreateEmployee: async () => true,
        canCreateDepartment: async () => true,
        canCreateDesignation: async () => true,
    };
}

/**
 * Validate limit before creation
 * Throws professional error message if limit reached
 */
export async function validateCreationLimit(
    userId: number,
    limitType: 'branch' | 'employee' | 'department' | 'designation'
): Promise<void> {
    const access = await getCompanyFeatureAccess(userId);

    if (access.isPlatformAdmin) return; // No limits for platform admin

    let canCreate = false;
    let limitValue = 0;

    switch (limitType) {
        case 'branch':
            canCreate = await access.canCreateBranch();
            limitValue = access.limits.maxBranches;
            break;
        case 'employee':
            canCreate = await access.canCreateEmployee();
            limitValue = access.limits.maxEmployees;
            break;
        case 'department':
            canCreate = await access.canCreateDepartment();
            limitValue = access.limits.maxDepartments;
            break;
        case 'designation':
            canCreate = await access.canCreateDesignation();
            limitValue = access.limits.maxDesignations;
            break;
    }

    if (!canCreate) {
        throw new Error(
            `Subscription Limit Reached: Your current plan allows a maximum of ${limitValue} ${limitType}(s). ` +
            `Please upgrade your subscription to continue.`
        );
    }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// EXPORT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const FeatureAccessControl = {
    getCompanyFeatureAccess,
    requireModuleAccess,
    requireAnyModuleAccess,
    getAccessibleMenus,
    validateCreationLimit,
};
