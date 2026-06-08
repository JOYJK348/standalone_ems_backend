/**
 * CORE API - Departments (Multi-Tenant)
 * Route: /api/core/departments
 */

import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/errorHandler';
import { core } from '@/lib/supabase';
import { applyTenantFilter, autoAssignCompany } from '@/middleware/tenantFilter';
import { getUserIdFromToken } from '@/lib/jwt';

export async function GET(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse('UNAUTHORIZED', 'Unauthorized', 401);

        let query = core.departments()
            .select(`
                *,
                companies:company_id (id, name),
                branches:branch_id (id, name)
            `)
            .eq('is_active', true)
            .order('name');

        query = await applyTenantFilter(userId, query);

        const { data, error } = await query;
        if (error) throw new Error(error.message);

        return successResponse(data, `Departments fetched successfully (${data?.length || 0} records)`);

    } catch (error: any) {
        return errorResponse('INTERNAL_ERROR', error.message || 'Failed to fetch departments', 500);
    }
}

export async function POST(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse('UNAUTHORIZED', 'Unauthorized', 401);

        let data = await req.json();
        data = await autoAssignCompany(userId, data);

        // ⚡ LIMIT ENFORCEMENT: Check if company can add more departments
        const { canAddResource } = await import('@/lib/services/LimitService');
        const limitCheck = await canAddResource(data.company_id, 'department');

        if (!limitCheck.allowed) {
            return errorResponse('LIMIT_REACHED', limitCheck.message, 403);
        }

        if (!data.name || !data.code) {
            return errorResponse('VALIDATION_ERROR', 'name and code are required', 400);
        }

        // Map and clean data for DB
        const departmentData = {
            company_id: data.company_id,
            name: data.name,
            code: data.code, // Column is 'code' in DB
            description: data.description || null,
            parent_department_id: data.parent_department_id || null,
            is_active: data.is_active !== false
        };

        console.log('Creating Department:', departmentData);

        const { data: department, error } = await core.departments()
            .insert(departmentData)
            .select('*, companies:company_id (id, name)')
            .single();

        if (error) {
            console.error('Dept DB Error:', error);
            throw new Error(error.message);
        }

        return successResponse(department, 'Department created successfully', 201);

    } catch (error: any) {
        console.error('Dept Create Error:', error);
        return errorResponse('INTERNAL_ERROR', error.message || 'Failed to create department', 500);
    }
}
