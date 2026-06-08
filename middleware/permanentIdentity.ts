/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * PERMANENT IDENTITY & SUBSCRIPTION LIMIT ENFORCEMENT
 * Durkkas Innovations Private Limited
 * Enterprise SaaS | Permanent IDs | Zero ID Reuse
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 
 * CORE PRINCIPLES:
 * 1. All IDs are system-generated (BIGSERIAL)
 * 2. IDs are NEVER reused, even after deletion
 * 3. Subscription limits are HARD limits
 * 4. No manual ID entry allowed
 * 5. Company-specific isolation
 * 
 * CRITICAL RULES:
 * - Suspended company IDs → Permanently retired
 * - Deleted company IDs → Never reused
 * - Recreated company → Gets new IDs
 * - Audit trail preserved forever
 * 
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 */

import { supabase, core } from '@/lib/supabase';
import { getUserTenantScope } from './tenantFilter';
import { getCompanyFeatureAccess } from './featureAccess';
import { logger } from '@/lib/logger';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TYPES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type EntityType = 'department' | 'designation' | 'branch' | 'employee';

export interface EntityLimitCheck {
    allowed: boolean;
    current: number;
    maximum: number;
    remaining: number;
    message?: string;
}

export interface EntityCreationContext {
    userId: number;
    companyId: number;
    entityType: EntityType;
    data: Record<string, any>;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SUBSCRIPTION LIMIT ENFORCEMENT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Check if company can create more entities of given type
 * This is the CORE function for subscription limit enforcement
 * 
 * @param userId - User ID making the request
 * @param entityType - Type of entity to create
 * @returns Limit check result with detailed information
 */
export async function checkEntityCreationLimit(
    userId: number,
    entityType: EntityType
): Promise<EntityLimitCheck> {
    try {
        // Get user's tenant scope
        const scope = await getUserTenantScope(userId);

        // Platform Admin: No limits
        if (scope.roleLevel >= 5) {
            return {
                allowed: true,
                current: 0,
                maximum: 0,
                remaining: 999999,
                message: 'Platform Admin - No limits'
            };
        }

        if (!scope.companyId) {
            throw new Error('User has no company assignment');
        }

        // Get company subscription details
        const { data: company, error } = await core.companies()
            .select('id, name, subscription_plan, max_departments, max_designations, max_branches, max_employees')
            .eq('id', scope.companyId)
            .single();

        if (error || !company) {
            throw new Error('Failed to fetch company subscription details');
        }

        // Get current count and maximum limit based on entity type
        let currentCount = 0;
        let maxLimit = 0;
        let entityName = '';

        switch (entityType) {
            case 'department':
                maxLimit = company.max_departments || 0;
                entityName = 'department';
                currentCount = await getActiveEntityCount(scope.companyId, 'departments');
                break;

            case 'designation':
                maxLimit = company.max_designations || 0;
                entityName = 'designation';
                currentCount = await getActiveEntityCount(scope.companyId, 'designations');
                break;

            case 'branch':
                maxLimit = company.max_branches || 0;
                entityName = 'branch';
                currentCount = await getActiveEntityCount(scope.companyId, 'branches');
                break;

            case 'employee':
                maxLimit = company.max_employees || 0;
                entityName = 'employee';
                currentCount = await getActiveEntityCount(scope.companyId, 'employees');
                break;
        }

        // Check if limit is unlimited (0 means unlimited)
        if (maxLimit === 0) {
            return {
                allowed: true,
                current: currentCount,
                maximum: 0,
                remaining: 999999,
                message: 'Unlimited'
            };
        }

        // Check if limit reached
        const allowed = currentCount < maxLimit;
        const remaining = Math.max(0, maxLimit - currentCount);

        const result: EntityLimitCheck = {
            allowed,
            current: currentCount,
            maximum: maxLimit,
            remaining,
        };

        if (!allowed) {
            result.message =
                `Subscription Limit Reached: Your current plan (${company.subscription_plan}) ` +
                `allows a maximum of ${maxLimit} ${entityName}${maxLimit > 1 ? 's' : ''}. ` +
                `You currently have ${currentCount} active ${entityName}${currentCount > 1 ? 's' : ''}. ` +
                `Please upgrade your subscription to add more.`;
        }

        logger.info('[EntityLimit] Limit check performed', {
            userId,
            companyId: scope.companyId,
            entityType,
            currentCount,
            maxLimit,
            allowed
        });

        return result;

    } catch (error: any) {
        logger.error('[EntityLimit] Error checking entity limit', {
            userId,
            entityType,
            error: error.message
        });
        throw error;
    }
}

/**
 * Enforce entity creation limit - throws error if limit reached
 * Use this in API routes before creating entities
 */
export async function enforceEntityCreationLimit(
    userId: number,
    entityType: EntityType
): Promise<void> {
    const check = await checkEntityCreationLimit(userId, entityType);

    if (!check.allowed) {
        throw new Error(check.message || 'Subscription limit reached');
    }
}

/**
 * Get current count of active entities for a company
 * Only counts non-deleted entities
 */
async function getActiveEntityCount(companyId: number, tableName: string): Promise<number> {
    const { count, error } = await supabase
        .schema('core' as any)
        .from(tableName)
        .select('*', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .is('deleted_at', null);

    if (error) {
        logger.error('[EntityLimit] Error counting entities', {
            companyId,
            tableName,
            error: error.message
        });
        return 0;
    }

    return count || 0;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PERMANENT IDENTITY MANAGEMENT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Prepare entity data for creation with automatic company assignment
 * Ensures:
 * 1. Company ID is automatically assigned
 * 2. No manual ID is accepted
 * 3. Audit fields are set
 * 
 * @param context - Entity creation context
 * @returns Sanitized data ready for insertion
 */
export async function prepareEntityForCreation(
    context: EntityCreationContext
): Promise<Record<string, any>> {
    const { userId, companyId, entityType, data } = context;

    // Remove any manually provided ID (security measure)
    const sanitizedData = { ...data };
    delete sanitizedData.id;

    // Auto-assign company ID
    sanitizedData.company_id = companyId;

    // Set audit fields
    sanitizedData.created_by = userId;
    sanitizedData.created_at = new Date().toISOString();

    logger.info('[PermanentID] Entity prepared for creation', {
        userId,
        companyId,
        entityType,
        hasManualId: 'id' in data // Log if someone tried to provide manual ID
    });

    return sanitizedData;
}

/**
 * Soft delete entity - marks as deleted but preserves ID forever
 * This ensures IDs are never reused
 * 
 * @param entityType - Type of entity
 * @param entityId - ID to soft delete
 * @param userId - User performing deletion
 * @param reason - Optional deletion reason
 */
export async function softDeleteEntity(
    entityType: EntityType,
    entityId: number,
    userId: number,
    reason?: string
): Promise<void> {
    const tableName = getTableName(entityType);

    const { error } = await supabase
        .schema('core' as any)
        .from(tableName)
        .update({
            deleted_at: new Date().toISOString(),
            deleted_by: userId,
            delete_reason: reason || 'Deleted by user'
        })
        .eq('id', entityId);

    if (error) {
        logger.error('[PermanentID] Error soft deleting entity', {
            entityType,
            entityId,
            error: error.message
        });
        throw new Error(`Failed to delete ${entityType}: ${error.message}`);
    }

    logger.info('[PermanentID] Entity soft deleted (ID permanently retired)', {
        entityType,
        entityId,
        userId,
        reason
    });
}

/**
 * Check if an entity name already exists for the company
 * Prevents duplicate names within same company
 * 
 * @param companyId - Company ID
 * @param entityType - Type of entity
 * @param name - Name to check
 * @param excludeId - Optional ID to exclude (for updates)
 * @returns true if name exists, false otherwise
 */
export async function checkEntityNameExists(
    companyId: number,
    entityType: EntityType,
    name: string,
    excludeId?: number
): Promise<boolean> {
    const tableName = getTableName(entityType);
    const nameColumn = getNameColumn(entityType);

    let query = supabase
        .schema('core' as any)
        .from(tableName)
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .ilike(nameColumn, name)
        .is('deleted_at', null);

    if (excludeId) {
        query = query.neq('id', excludeId);
    }

    const { count } = await query;

    return (count || 0) > 0;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// COMPANY SUSPENSION & DELETION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Suspend company - marks as inactive but preserves all IDs
 * All entity IDs remain permanently retired
 * 
 * @param companyId - Company to suspend
 * @param userId - User performing suspension
 * @param reason - Suspension reason
 */
export async function suspendCompany(
    companyId: number,
    userId: number,
    reason: string
): Promise<void> {
    const { error } = await core.companies()
        .update({
            is_active: false,
            subscription_status: 'SUSPENDED',
            updated_at: new Date().toISOString(),
            updated_by: userId
        })
        .eq('id', companyId);

    if (error) {
        throw new Error(`Failed to suspend company: ${error.message}`);
    }

    logger.warn('[PermanentID] Company suspended - All IDs permanently retired', {
        companyId,
        userId,
        reason,
        note: 'IDs will NEVER be reused even if company is reactivated'
    });
}

/**
 * Soft delete company - marks as deleted but preserves all historical data
 * All entity IDs remain permanently in database for audit trail
 * 
 * @param companyId - Company to delete
 * @param userId - User performing deletion
 * @param reason - Deletion reason
 */
export async function softDeleteCompany(
    companyId: number,
    userId: number,
    reason: string
): Promise<void> {
    const { error } = await core.companies()
        .update({
            is_active: false,
            deleted_at: new Date().toISOString(),
            deleted_by: userId,
            delete_reason: reason
        })
        .eq('id', companyId);

    if (error) {
        throw new Error(`Failed to delete company: ${error.message}`);
    }

    logger.warn('[PermanentID] Company deleted - All IDs permanently archived', {
        companyId,
        userId,
        reason,
        note: 'Historical data preserved. IDs NEVER reused.'
    });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HELPER FUNCTIONS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function getTableName(entityType: EntityType): string {
    const tableMap: Record<EntityType, string> = {
        department: 'departments',
        designation: 'designations',
        branch: 'branches',
        employee: 'employees'
    };
    return tableMap[entityType];
}

function getNameColumn(entityType: EntityType): string {
    const columnMap: Record<EntityType, string> = {
        department: 'name',
        designation: 'title',
        branch: 'name',
        employee: 'first_name' // For employees, we'll check first_name
    };
    return columnMap[entityType];
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// EXPORT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const PermanentIdentityControl = {
    // Limit enforcement
    checkEntityCreationLimit,
    enforceEntityCreationLimit,

    // Entity management
    prepareEntityForCreation,
    softDeleteEntity,
    checkEntityNameExists,

    // Company management
    suspendCompany,
    softDeleteCompany,
};

/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * CRITICAL SECURITY NOTES
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 
 * 1. NEVER allow manual ID entry in any form
 * 2. ALWAYS use BIGSERIAL for ID generation
 * 3. NEVER reuse IDs even after deletion
 * 4. ALWAYS soft delete (preserve historical data)
 * 5. ALWAYS check subscription limits before creation
 * 6. ALWAYS auto-assign company_id
 * 7. NEVER trust client-provided IDs
 * 8. ALWAYS log limit violations for monitoring
 * 
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 */
