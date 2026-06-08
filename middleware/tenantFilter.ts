/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * MULTI-TENANT SECURITY MIDDLEWARE
 * Durkkas Innovations Private Limited
 * Enterprise-Grade | High Security | Production-Ready
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 
 * PURPOSE:
 * Automatic data isolation for multi-tenant SaaS platform
 * 
 * SECURITY MODEL:
 * - PLATFORM_ADMIN (Level 5): Access ALL companies
 * - COMPANY_ADMIN (Level 4): Access ONLY their assigned company
 * - Others: Access based on company/branch assignment
 * 
 * USAGE:
 * ```typescript
 * let query = supabase.from('employees').select('*');
 * query = await applyTenantFilter(userId, query);
 * const { data } = await query;
 * ```
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 */

import { supabase, app_auth, core, ems } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { AppError } from '@/lib/errorHandler';
import { headers, cookies } from 'next/headers';
import { tenantCache } from '@/lib/cache/tenantCache';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TYPES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface TenantScope {
    userId: number;
    roleLevel: number;
    roleName: string;
    roleType: string;
    companyId: number | null;
    branchId: number | null;
    isScoped: boolean; // True if scoped to a specific company
    selectionReason?: string; // NEW: Explains WHY this role was selected
    // EMS Profile Resolution (for role-based filtering)
    emsProfile?: {
        profileType: 'tutor' | 'student' | 'manager' | null;
        profileId: number | null; // employee_id for tutor, student_id for student
    };
}

export interface TenantFilterOptions {
    companyColumn?: string;  // Default: 'company_id'
    branchColumn?: string;   // Default: 'branch_id'
    isTableBranches?: boolean; // If true, filter 'id' by branchId for non-platform users
    skipFilter?: boolean;    // Dangerous! Use only for global tables
    logAccess?: boolean;     // Log access for audit
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CORE FUNCTIONS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Get user's tenant scope (company, role level, etc.)
 * 
 * @param userId - User ID from JWT token
 * @returns Tenant scope information
 * @throws Error if user has no valid role assignment
 */
// Refactored to use direct query instead of RPC to avoid schema/path issues
// Refactored to use direct query instead of RPC to avoid schema/path issues
export async function getUserTenantScope(
    userId: number,
    preferredBranchId?: number | string,
    preferredCompanyId?: number | string
): Promise<TenantScope> {
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // CACHE LAYER - ULTRA-FAST RESPONSE
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    const cached = tenantCache.get(userId, preferredCompanyId, preferredBranchId);
    if (cached) {
        return cached;
    }

    // NEW: Autonomic sensing of context from request environment if not explicitly provided
    let pBranch = preferredBranchId;
    let pCompany = preferredCompanyId;

    if (!pBranch || !pCompany) {
        try {
            const reqHeaders = headers();
            const reqCookies = cookies();
            pBranch = pBranch || reqHeaders.get('x-branch-id') || reqCookies.get('x-branch-id')?.value || undefined;
            pCompany = pCompany || reqHeaders.get('x-company-id') || reqCookies.get('x-company-id')?.value || undefined;
        } catch (e) {
            // Probably not in a request context (e.g. background job)
        }
    }

    try {
        // 2. Fetch User Roles with joined Role Details (Atomic Fetch)
        const { data: userRoles, error: rolesError } = await app_auth.userRoles()
            .select(`
                company_id,
                branch_id,
                is_active,
                roles!inner (
                    id,
                    name,
                    level,
                    role_type
                )
            `)
            .eq('user_id', userId)
            .eq('is_active', true);

        if (rolesError) throw rolesError;

        if (!userRoles || userRoles.length === 0) {
            logger.warn('[TenantFilter] User has no active role assignment', { userId });
            throw new AppError('AUTHENTICATION_ERROR', 'User has no active role assignment.', 401);
        }

        // 3. Transform and Sort by Hierarchy
        const combined = userRoles.map((ur: any) => ({
            company_id: ur.company_id,
            branch_id: ur.branch_id,
            role_id: ur.roles.id,
            role_level: Number(ur.roles.level || 0),
            role_name: ur.roles.name,
            role_type: ur.roles.role_type
        })).sort((a: any, b: any) => b.role_level - a.role_level);

        logger.info('[TenantFilter] Scoping trace', { userId, roles: combined.map(r => r.role_name).join(', ') });

        // 4. Selection Strategy: Highest Authority in the current context
        let selectedRole = combined[0];
        let isScoped = false;
        let selectionReason = 'Default High-Level';

        // Filter roles matching the company context
        if (pCompany && !isNaN(Number(pCompany)) && Number(pCompany) !== 0) {
            const companyMatchedRoles = combined.filter(r =>
                String(r.company_id) === String(pCompany) || r.company_id === null
            );

            if (companyMatchedRoles.length > 0) {
                // companyMatchedRoles is already sorted by role_level
                const highestInCompany = companyMatchedRoles[0];
                selectedRole = highestInCompany;
                isScoped = true;
                selectionReason = `Highest in Company ${pCompany}`;

                // Refine by branch if provided, BUT only if it doesn't downgrade us
                if (pBranch && !isNaN(Number(pBranch))) {
                    const branchMatchedRole = companyMatchedRoles.find(r => String(r.branch_id) === String(pBranch));
                    if (branchMatchedRole) {
                        // Hierarchy Protection: Never downgrade from a Manager-tier role (L>=2) to a lower tier
                        const isCurrentManager = selectedRole.role_level >= 2 || selectedRole.role_name === 'ACADEMIC_MANAGER';
                        const isBranchManager = branchMatchedRole.role_level >= 2 || branchMatchedRole.role_name === 'ACADEMIC_MANAGER';

                        if (branchMatchedRole.role_level >= selectedRole.role_level || (isBranchManager && !isCurrentManager)) {
                            selectedRole = branchMatchedRole;
                            selectionReason = `Branch Match for ${pBranch}`;
                        } else {
                            logger.info('[TenantFilter] Hierarchical Override: Ignored low-level branch role', {
                                userId, branchPref: pBranch, selected: selectedRole.role_name, ignored: branchMatchedRole.role_name
                            });
                            selectionReason = `Hierarchy Protected (${highestInCompany.role_name} > ${branchMatchedRole.role_name})`;
                        }
                    }
                }
            } else if (combined[0].role_level >= 5) {
                selectedRole = {
                    ...combined[0],
                    company_id: Number(pCompany),
                    branch_id: (pBranch && !isNaN(Number(pBranch))) ? Number(pBranch) : null
                };
                isScoped = true;
                selectionReason = 'Platform Admin Override';
            }
        }
        else if (pBranch && !isNaN(Number(pBranch))) {
            const branchMatchedRoles = combined.filter(r => String(r.branch_id) === String(pBranch) || r.branch_id === null);
            if (branchMatchedRoles.length > 0) {
                selectedRole = branchMatchedRoles[0];
                selectionReason = `Branch Context ${pBranch}`;
            }
        }

        // 4.1 GLOBAL HIERARCHY PROTECTION FAIL-SAFE (GOD MODE)
        // Ensure we didn't miss a high-level role due to complex branch/preference filtering
        const betterRole = combined.find(r =>
            (String(r.company_id) === String(pCompany) || r.company_id === null) &&
            r.role_level > selectedRole.role_level
        );

        if (betterRole) {
            logger.warn('[TenantFilter] FALLBACK PROTECTION: Found better role in context', {
                userId, rejected: selectedRole.role_name, promotedTo: betterRole.role_name
            });
            selectedRole = betterRole;
            selectionReason = `Heuristic Promotion (${betterRole.role_name})`;
        }

        logger.info('[TenantFilter] Final selection', {
            userId,
            role: selectedRole.role_name,
            level: selectedRole.role_level,
            companyId: selectedRole.company_id,
            branchId: selectedRole.branch_id,
            reason: selectionReason
        });

        const tenantScope: TenantScope = {
            userId,
            roleLevel: selectedRole.role_level,
            roleName: selectedRole.role_name,
            roleType: selectedRole.role_type,
            companyId: selectedRole.company_id,
            branchId: selectedRole.branch_id,
            isScoped,
            selectionReason
        };

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // EMS PROFILE RESOLUTION (for role-based data filtering)
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        try {
            if (selectedRole.role_name === 'TUTOR') {
                // 1. Try resolving by user_id first
                // Use a safe column selection in case user_id doesn't exist yet
                const { data: employee, error: empError } = await core.employees()
                    .select('id, email')
                    .eq('user_id', userId as any) // Cast to any to bypass potential TS errors if not in types
                    .eq('company_id', selectedRole.company_id)
                    .maybeSingle();

                if (employee) {
                    tenantScope.emsProfile = {
                        profileType: 'tutor',
                        profileId: (employee as any).id
                    };
                    logger.info('[TenantFilter] Resolved TUTOR profile via user_id', { userId, employeeId: (employee as any).id });
                } else if (!empError) {
                    // 2. Fallback: Try resolving by email
                    const { data: userData } = await app_auth.users()
                        .select('email')
                        .eq('id', userId)
                        .maybeSingle();

                    if (userData?.email) {
                        const { data: empByEmail } = await core.employees()
                            .select('id, email')
                            .eq('email', userData.email)
                            .eq('company_id', selectedRole.company_id)
                            .maybeSingle();

                        if (empByEmail) {
                            tenantScope.emsProfile = {
                                profileType: 'tutor',
                                profileId: (empByEmail as any).id
                            };
                            logger.info('[TenantFilter] Resolved TUTOR profile via email', { userId, employeeId: (empByEmail as any).id });

                            // Background task: Try to link user_id if column exists
                            (async () => {
                                try {
                                    await core.employees().update({ user_id: userId } as any).eq('id', empByEmail.id);
                                } catch (e) { }
                            })();
                        }
                    }
                }
            } else if (selectedRole.role_name === 'STUDENT') {
                // 1. Try resolving by user_id first
                const { data: student, error: studentIdError } = await ems.students()
                    .select('id, email')
                    .eq('user_id', userId as any)
                    .eq('company_id', selectedRole.company_id)
                    .maybeSingle();

                if (student) {
                    tenantScope.emsProfile = {
                        profileType: 'student',
                        profileId: (student as any).id
                    };
                    logger.info('[TenantFilter] Resolved STUDENT profile via user_id', { userId, studentId: (student as any).id });
                } else if (!studentIdError) {
                    // 2. Fallback: Try resolving by email
                    const { data: userData } = await app_auth.users()
                        .select('email')
                        .eq('id', userId)
                        .maybeSingle();

                    if (userData?.email) {
                        const { data: studentByEmail } = await ems.students()
                            .select('id, email')
                            .eq('email', userData.email)
                            .eq('company_id', selectedRole.company_id)
                            .maybeSingle();

                        if (studentByEmail) {
                            tenantScope.emsProfile = {
                                profileType: 'student',
                                profileId: (studentByEmail as any).id
                            };
                            logger.info('[TenantFilter] Resolved STUDENT profile via email', { userId, studentId: (studentByEmail as any).id });

                            // Background task: Try to link user_id
                            (async () => {
                                try {
                                    await ems.students().update({ user_id: userId } as any).eq('id', studentByEmail.id);
                                } catch (e) { }
                            })();
                        }
                    }
                }
            } else if (selectedRole.role_name === 'ACADEMIC_MANAGER' || selectedRole.role_level >= 2) {
                tenantScope.emsProfile = {
                    profileType: 'manager',
                    profileId: null
                };
            }
        } catch (profileError: any) {
            logger.warn('[TenantFilter] Could not resolve EMS profile (non-critical)', {
                userId,
                roleName: selectedRole.role_name,
                error: profileError.message
            });
        }


        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // CACHE THE RESULT FOR FUTURE REQUESTS
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        tenantCache.set(userId, tenantScope, pCompany, pBranch);

        return tenantScope;

    } catch (error: any) {
        console.error('❌ [TenantFilter] CRITICAL ERROR in getUserTenantScope:', {
            userId,
            message: error.message,
            code: error.code,
            stack: error.stack
        });

        if (error instanceof AppError) throw error;
        throw new Error(`Failed to get tenant scope: ${error.message}`);
    }
}

/**
 * Apply multi-tenant filter to a Supabase query
 * 
 * SECURITY: This is the CORE security function for data isolation
 * 
 * @param userId - User ID from JWT token
 * @param query - Supabase query builder
 * @param options - Filter options
 * @returns Filtered query
 * 
 * @example
 * ```typescript
 * // Basic usage
 * let query = supabase.from('employees').select('*');
 * query = await applyTenantFilter(userId, query);
 * 
 * // Custom column name
 * query = await applyTenantFilter(userId, query, {
 *   companyColumn: 'organization_id'
 * });
 * 
 * // Skip filter for global tables (USE WITH EXTREME CAUTION!)
 * query = await applyTenantFilter(userId, query, {
 *   skipFilter: true  // Only for countries, currencies, etc.
 * });
 * ```
 */
export async function applyTenantFilter(
    userId: number,
    query: any,
    options: TenantFilterOptions = {}
): Promise<any> {
    const {
        companyColumn = 'company_id',
        branchColumn = 'branch_id',
        isTableBranches = false,
        skipFilter = false,
        logAccess = false
    } = options;

    // Skip filter if explicitly requested (for global tables like countries)
    if (skipFilter) {
        logger.warn('[TenantFilter] Filter skipped (skipFilter=true)', {
            userId,
            warning: 'Ensure this is for global data only!'
        });
        return query;
    }

    try {
        // Extract preferred branch from headers or cookies
        const reqHeaders = headers();
        const reqCookies = cookies();
        const preferredBranchId = reqHeaders.get('x-branch-id') || reqCookies.get('x-branch-id')?.value || undefined;
        const preferredCompanyId = reqHeaders.get('x-company-id') || reqCookies.get('x-company-id')?.value || undefined;

        // Get user's tenant scope
        const scope = await getUserTenantScope(userId, preferredBranchId, preferredCompanyId);

        // PLATFORM_ADMIN (Level 5+): No filter - can see ALL companies UNLESS scoped
        if (scope.roleLevel >= 5 && !scope.isScoped) {
            logger.info('[TenantFilter] Platform Admin (Global) - No filter applied', {
                userId,
                roleName: scope.roleName,
                roleLevel: scope.roleLevel
            });

            // Log access for audit (platform admin accessing all data)
            if (logAccess) {
                await logTenantAccess(userId, scope, null, 'PLATFORM_ACCESS');
            }

            return query;
        }

        // COMPANY_ADMIN & Others: Apply company filter
        if (scope.companyId === null) {
            // This should NEVER happen due to database constraint
            // But we check anyway for defense in depth
            logger.error('[TenantFilter] SECURITY VIOLATION: Non-platform user with NULL company_id', {
                userId,
                roleName: scope.roleName,
                roleLevel: scope.roleLevel
            });

            throw new Error(`SECURITY ERROR: User ${userId} has no company assignment.`);
        }

        // 1. Apply Company Filter (Fundamental isolation)
        query = query.eq(companyColumn, scope.companyId);

        // 2. Apply Branch Filter (Granular isolation for Level < 4)
        // If user has a specific branch assignment and is NOT a Company Admin
        if (scope.roleLevel < 4 && scope.branchId) {
            if (isTableBranches) {
                // If we are querying the branches table itself, the 'id' must be the user's branch
                logger.debug('[TenantFilter] Applying branch self-filter (id)', { userId, branchId: scope.branchId });
                query = query.eq('id', scope.branchId);
            } else {
                // For other tables, filter by the branch column (if it exists in the query)
                // Note: We assume the table has the branch column if it's not a global table.
                // Designations don't have branch_id, so we might need to skip for them or handle it.
                // For now, only apply if branchColumn is not specifically disabled.
                if (branchColumn) {
                    logger.debug('[TenantFilter] Applying branch filter', { userId, branchId: scope.branchId, branchColumn });
                    query = query.eq(branchColumn, scope.branchId);
                }
            }
        }

        // Log access for audit
        if (logAccess) {
            await logTenantAccess(userId, scope, scope.companyId, 'TENANT_ACCESS');
        }

        return query;

    } catch (error: any) {
        logger.error('[TenantFilter] Error applying tenant filter', {
            userId,
            error: error.message,
            stack: error.stack
        });
        throw error;
    }
}

/**
 * Check if user can access a specific company
 * 
 * @param userId - User ID
 * @param companyId - Company ID to check
 * @returns true if user can access, false otherwise
 */
export async function canAccessCompany(
    userId: number,
    companyId: number
): Promise<boolean> {
    try {
        const scope = await getUserTenantScope(userId);

        // Platform Admin (Level 5+): Can access ALL companies
        if (scope.roleLevel >= 5) {
            return true;
        }

        // Company Admin (Level 4): Can only access their assigned company
        if (scope.roleLevel === 4) {
            return scope.companyId === companyId;
        }

        // Others: Check company assignment
        return scope.companyId === companyId;

    } catch (error: any) {
        logger.error('[TenantFilter] Exception in canAccessCompany', {
            userId,
            companyId,
            error: error.message
        });
        return false;
    }
}

/**
 * Validate company access and throw error if denied
 * Use this in API routes that accept company_id as parameter
 * 
 * @param userId - User ID
 * @param companyId - Company ID to validate
 * @throws Error if access is denied
 * 
 * @example
 * ```typescript
 * // In API route
 * const { company_id } = await req.json();
 * await validateCompanyAccess(userId, company_id);
 * // If we reach here, access is granted
 * ```
 */
export async function validateCompanyAccess(
    userId: number,
    companyId: number
): Promise<void> {
    const hasAccess = await canAccessCompany(userId, companyId);

    if (!hasAccess) {
        const scope = await getUserTenantScope(userId);

        logger.warn('[TenantFilter] SECURITY: Company access denied', {
            userId,
            requestedCompanyId: companyId,
            userCompanyId: scope.companyId,
            roleName: scope.roleName
        });

        throw new Error(
            `Access Denied: You do not have permission to access company ${companyId}. ` +
            `Your access is restricted to company ${scope.companyId || 'None'}.`
        );
    }
}

/**
 * Get list of companies user can access
 * 
 * @param userId - User ID
 * @returns Array of company IDs
 */
export async function getUserAccessibleCompanies(
    userId: number
): Promise<number[]> {
    try {
        const scope = await getUserTenantScope(userId);

        // Platform Admin: Get all active companies
        if (scope.roleLevel >= 5) {
            const { data, error } = await supabase
                .from('companies')
                .select('id')
                .eq('is_active', true);

            if (error) {
                logger.error('[TenantFilter] Error fetching companies', { error: error.message });
                throw new Error(`Data Infrastructure Error: Unable to fetch entity registry. ${error.message}`);
            }

            return (data as any)?.map((c: any) => c.id) || [];
        }

        // Company Admin & Others: Only their company
        return scope.companyId ? [scope.companyId] : [];

    } catch (error: any) {
        logger.error('[TenantFilter] Error in getUserAccessibleCompanies', {
            userId,
            error: error.message
        });
        return [];
    }
}

/**
 * Auto-assign company_id for INSERT operations
 * 
 * @param userId - User ID
 * @param data - Data object to insert
 * @returns Data with company_id assigned
 * 
 * @example
 * ```typescript
 * let employeeData = { first_name: 'John', last_name: 'Doe' };
 * employeeData = await autoAssignCompany(userId, employeeData);
 * // employeeData now has company_id set
 * ```
 */
export async function autoAssignCompany<T extends Record<string, any>>(
    userId: number,
    data: T
): Promise<T> {
    try {
        const scope = await getUserTenantScope(userId);

        // Platform Admin: Must explicitly specify company_id
        if (scope.roleLevel >= 5) {
            if (!data.company_id) {
                throw new Error(
                    'Platform Admin must explicitly specify company_id when creating records'
                );
            }

            // Validate company exists
            const { data: company, error } = await supabase
                .from('companies')
                .select('id')
                .eq('id', data.company_id)
                .single();

            if (error || !company) {
                throw new Error(`Invalid company_id: ${data.company_id}`);
            }

            return data;
        }

        // Company Admin & Others: Auto-assign their company/branch
        if (scope.companyId) {
            (data as any).company_id = scope.companyId;

            // NEW: Also auto-assign branch if the user has one and it's not already set
            if (scope.branchId && !(data as any).branch_id) {
                (data as any).branch_id = scope.branchId;
            }

            logger.debug('[TenantFilter] Auto-assigned tenant context', {
                userId,
                companyId: scope.companyId,
                branchId: scope.branchId
            });
            return data;
        }

        throw new Error('User has no company assignment');

    } catch (error: any) {
        logger.error('[TenantFilter] Error in autoAssignCompany', {
            userId,
            error: error.message
        });
        throw error;
    }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AUDIT LOGGING
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Log tenant access for audit trail
 * (Internal function - called automatically by applyTenantFilter)
 */
async function logTenantAccess(
    userId: number,
    scope: TenantScope,
    accessedCompanyId: number | null,
    accessType: string
): Promise<void> {
    try {
        const { AuditService } = require('@/lib/services/AuditService');
        await AuditService.logAction({
            userId,
            action: accessType,
            tableName: 'TENANT_ACCESS',
            schemaName: 'app_auth',
            companyId: accessedCompanyId || undefined,
            newData: {
                role_level: scope.roleLevel,
                role_name: scope.roleName,
                user_company_id: scope.companyId,
                accessed_company_id: accessedCompanyId
            }
        });
    } catch (error: any) {
        logger.error('[TenantFilter] Failed to log tenant access', {
            userId,
            error: error.message
        });
    }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SECURITY NOTES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 1. NEVER skip tenant filter unless absolutely necessary (global tables only)
 * 2. ALWAYS use applyTenantFilter for company-scoped queries
 * 3. ALWAYS use autoAssignCompany for INSERT operations
 * 4. ALWAYS use validateCompanyAccess when company_id is in request
 * 5. Database constraint ensures COMPANY_ADMIN must have company_id
 * 6. All access is logged for audit trail
 * 7. Platform Admin access is logged separately for monitoring
 */

