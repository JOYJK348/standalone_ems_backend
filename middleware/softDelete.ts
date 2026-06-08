/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * SOFT DELETE MIDDLEWARE
 * Agaran Innovations Private Limited
 * Enterprise-Grade Data Protection & Audit Trail
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 
 * PURPOSE:
 * - Never actually delete data from database
 * - Mark records as deleted with audit trail
 * - Auto-hide deleted records from queries
 * - Ability to restore deleted records
 * 
 * USAGE:
 * ```typescript
 * // Soft delete
 * await softDeleteRecord('employees', 123, userId, 'Employee resigned');
 * 
 * // Restore
 * await restoreRecord('employees', 123, userId);
 * 
 * // Query (auto-excludes deleted)
 * let query = supabase.from('employees').select('*');
 * query = excludeDeleted(query);
 * ```
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 */

import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TYPES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface SoftDeleteOptions {
    reason?: string;
    includeDeleted?: boolean;  // For admin views
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CORE FUNCTIONS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Soft delete a record (marks as deleted, doesn't remove)
 * 
 * @param tableName - Table name (e.g., 'employees')
 * @param recordId - Record ID to delete
 * @param deletedBy - User ID performing the delete
 * @param reason - Optional reason for deletion
 * @returns Success boolean
 * 
 * @example
 * ```typescript
 * await softDeleteRecord('employees', 123, userId, 'Employee resigned');
 * ```
 */
export async function softDeleteRecord(
    tableName: string,
    recordId: number,
    deletedBy: number,
    reason?: string
): Promise<boolean> {
    try {
        // Determine schema from table name
        const schemaName = getSchemaFromTable(tableName);

        logger.info('[SoftDelete] Marking record as deleted', {
            schema: schemaName,
            table: tableName,
            recordId,
            deletedBy,
            reason
        });

        // Call database function
        const { data, error } = await (supabase as any).rpc('soft_delete_record', {
            p_schema_name: schemaName,
            p_table_name: tableName,
            p_record_id: recordId,
            p_deleted_by: deletedBy,
            p_delete_reason: reason || null
        });

        if (error) {
            logger.error('[SoftDelete] Failed to soft delete', {
                error: error.message,
                tableName,
                recordId
            });
            throw new Error(`Soft delete failed: ${error.message}`);
        }

        logger.info('[SoftDelete] Record marked as deleted successfully', {
            tableName,
            recordId
        });

        return data === true;

    } catch (error: any) {
        logger.error('[SoftDelete] Exception in softDeleteRecord', {
            error: error.message,
            tableName,
            recordId
        });
        throw error;
    }
}

/**
 * Restore a soft-deleted record
 * 
 * @param tableName - Table name
 * @param recordId - Record ID to restore
 * @param restoredBy - User ID performing the restore
 * @returns Success boolean
 * 
 * @example
 * ```typescript
 * await restoreRecord('employees', 123, userId);
 * ```
 */
export async function restoreRecord(
    tableName: string,
    recordId: number,
    restoredBy: number
): Promise<boolean> {
    try {
        const schemaName = getSchemaFromTable(tableName);

        logger.info('[SoftDelete] Restoring deleted record', {
            schema: schemaName,
            table: tableName,
            recordId,
            restoredBy
        });

        // Call database function
        const { data, error } = await (supabase as any).rpc('restore_deleted_record', {
            p_schema_name: schemaName,
            p_table_name: tableName,
            p_record_id: recordId,
            p_restored_by: restoredBy
        });

        if (error) {
            logger.error('[SoftDelete] Failed to restore record', {
                error: error.message,
                tableName,
                recordId
            });
            throw new Error(`Restore failed: ${error.message}`);
        }

        logger.info('[SoftDelete] Record restored successfully', {
            tableName,
            recordId
        });

        return data === true;

    } catch (error: any) {
        logger.error('[SoftDelete] Exception in restoreRecord', {
            error: error.message,
            tableName,
            recordId
        });
        throw error;
    }
}

/**
 * Exclude deleted records from query (auto-filter)
 * 
 * @param query - Supabase query builder
 * @param options - Options (includeDeleted for admin views)
 * @returns Filtered query
 * 
 * @example
 * ```typescript
 * // Normal users - exclude deleted
 * let query = supabase.from('employees').select('*');
 * query = excludeDeleted(query);
 * 
 * // Admin view - include deleted
 * query = excludeDeleted(query, { includeDeleted: true });
 * ```
 */
export function excludeDeleted(
    query: any,
    options: SoftDeleteOptions = {}
): any {
    const { includeDeleted = false } = options;

    // If includeDeleted is true, don't filter (for admin views)
    if (includeDeleted) {
        logger.debug('[SoftDelete] Including deleted records (admin view)');
        return query;
    }

    // Default: Exclude deleted records
    logger.debug('[SoftDelete] Excluding deleted records');
    return query.is('deleted_at', null);
}

/**
 * Get only deleted records (for trash/recycle bin view)
 * 
 * @param query - Supabase query builder
 * @returns Query filtered to only deleted records
 * 
 * @example
 * ```typescript
 * let query = supabase.from('employees').select('*');
 * query = onlyDeleted(query);
 * // Returns only soft-deleted employees
 * ```
 */
export function onlyDeleted(query: any): any {
    logger.debug('[SoftDelete] Fetching only deleted records');
    return query.not('deleted_at', 'is', null);
}

/**
 * Check if a record is deleted
 * 
 * @param tableName - Table name
 * @param recordId - Record ID
 * @returns true if deleted, false otherwise
 */
export async function isRecordDeleted(
    tableName: string,
    recordId: number
): Promise<boolean> {
    try {
        const schemaName = getSchemaFromTable(tableName);

        const { data, error } = await (supabase as any)
            .from(`${schemaName}.${tableName}`)
            .select('deleted_at')
            .eq('id', recordId)
            .single();

        if (error) {
            logger.error('[SoftDelete] Error checking if record is deleted', {
                error: error.message
            });
            return false;
        }

        return data?.deleted_at !== null;

    } catch (error: any) {
        logger.error('[SoftDelete] Exception in isRecordDeleted', {
            error: error.message
        });
        return false;
    }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HELPER FUNCTIONS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Get schema name from table name
 * (Maps table to its schema)
 */
function getSchemaFromTable(tableName: string): string {
    // Core schema tables
    const coreTables = [
        'companies', 'branches', 'departments', 'designations', 'employees',
        'countries', 'states', 'cities'
    ];

    // HRMS schema tables
    const hrmsTables = [
        'attendance', 'leave_types', 'leaves', 'salary_components',
        'employee_salary', 'payroll', 'job_openings', 'candidates',
        'job_applications', 'interviews', 'appraisal_cycles',
        'performance_reviews', 'training_programs', 'training_enrollments'
    ];

    // EMS schema tables
    const emsTables = [
        'students', 'courses', 'batches', 'enrollments', 'teacher_assignments'
    ];

    // Finance schema tables
    const financeTables = [
        'invoices', 'payments', 'refunds'
    ];

    // CRM schema tables
    const crmTables = [
        'leads', 'followups', 'conversions'
    ];

    // Auth schema tables
    const authTables = [
        'users', 'roles', 'permissions', 'user_roles', 'role_permissions',
        'menu_registry', 'menu_permissions', 'audit_logs', 'login_history'
    ];

    // Determine schema
    if (coreTables.includes(tableName)) return 'core';
    if (hrmsTables.includes(tableName)) return 'hrms';
    if (emsTables.includes(tableName)) return 'ems';
    if (financeTables.includes(tableName)) return 'finance';
    if (crmTables.includes(tableName)) return 'crm';
    if (authTables.includes(tableName)) return 'app_auth';

    // Default to core if not found
    logger.warn('[SoftDelete] Unknown table, defaulting to core schema', {
        tableName
    });
    return 'core';
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// USAGE NOTES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 1. ALWAYS use excludeDeleted() in GET queries
 * 2. NEVER use hard DELETE in production
 * 3. Use softDeleteRecord() instead of DELETE
 * 4. Provide delete reason for audit trail
 * 5. Only Platform Admin can restore deleted records
 * 6. Deleted records remain in database forever (compliance)
 * 7. Use onlyDeleted() for trash/recycle bin views
 */

