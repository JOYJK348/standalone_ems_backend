/**
 * CORE API - Employees (Multi-Tenant)
 * Route: /api/core/employees
 */

import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/errorHandler';
import { core } from '@/lib/supabase';
import { applyTenantFilter, autoAssignCompany } from '@/middleware/tenantFilter';
import { getUserIdFromToken } from '@/lib/jwt';

/**
 * GET /api/core/employees
 * Returns employees based on user's tenant scope
 */
export async function GET(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) {
            return errorResponse('UNAUTHORIZED', 'Unauthorized', 401);
        }

        // Build query with relations
        let query = core.employees()
            .select(`
                *,
                companies:company_id (id, name, code),
                branches:branch_id (id, name),
                departments:department_id (id, name),
                designations:designation_id (id, title)
            `)
            .eq('is_active', true)
            .order('created_at', { ascending: false });

        // Apply multi-tenant filter
        query = await applyTenantFilter(userId, query);

        const { data, error } = await query;

        if (error) throw new Error(error.message);

        // 🛡️ High-Verbosity Audit
        const { AuditService } = await import('@/lib/services/AuditService');
        await AuditService.logAction({
            userId,
            action: 'LIST',
            tableName: 'employees',
            schemaName: 'core',
            ipAddress: AuditService.getIP(req),
        });

        return successResponse(data, `Employees fetched successfully (${data?.length || 0} records)`);

    } catch (error: any) {
        return errorResponse('INTERNAL_ERROR', error.message || 'Failed to fetch employees', 500);
    }
}

/**
 * POST /api/core/employees
 * Create new employee (company_id auto-assigned based on user scope)
 */
export async function POST(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) {
            return errorResponse('UNAUTHORIZED', 'Unauthorized', 401);
        }

        let data = await req.json();

        // Auto-assign company_id based on user's scope
        data = await autoAssignCompany(userId, data);

        // ⚡ LIMIT ENFORCEMENT: Check if company can add more employees
        const { canAddResource } = await import('@/lib/services/LimitService');
        const limitCheck = await canAddResource(data.company_id, 'employee');

        if (!limitCheck.allowed) {
            return errorResponse('LIMIT_REACHED', limitCheck.message, 403);
        }

        // Validate required fields
        if (!data.first_name || !data.employee_code) {
            return errorResponse('VALIDATION_ERROR', 'first_name and employee_code are required', 400);
        }

        // Insert employee
        const { data: employee, error } = await core.employees()
            .insert(data)
            .select(`
                *,
                companies:company_id (id, name, code),
                branches:branch_id (id, name)
            `)
            .single();

        if (error) {
            // Check for duplicate employee_code
            if (error.code === '23505') {
                const message = error.message?.toLowerCase() || '';
                const details = error.details?.toLowerCase() || '';

                if (message.includes('employee_code') || details.includes('employee_code')) {
                    return errorResponse(
                        'DUPLICATE_ENTRY',
                        'This employee code is already assigned to another staff member in your company. Please use a unique employee code.',
                        409,
                        { field: 'employee_code' },
                        'employee_code'
                    );
                }
                if (message.includes('email') || details.includes('email')) {
                    return errorResponse(
                        'DUPLICATE_ENTRY',
                        'This email address is already associated with another employee. Please use a unique email.',
                        409,
                        { field: 'email' },
                        'email'
                    );
                }
            }
            throw new Error(error.message);
        }

        return successResponse(employee, 'Employee created successfully', 201);

    } catch (error: any) {
        // Enhanced error parsing at catch level
        const message = error.message || '';

        if (message.includes('duplicate') || message.includes('unique') || message.includes('23505')) {
            if (message.toLowerCase().includes('employee_code')) {
                return errorResponse(
                    'DUPLICATE_ENTRY',
                    'This employee code is already in use. Please choose a unique employee code.',
                    409,
                    { field: 'employee_code' },
                    'employee_code'
                );
            }
        }

        return errorResponse('INTERNAL_ERROR', error.message || 'Failed to create employee', 500);
    }
}
