/**
 * CORE API - Designations (Multi-Tenant)
 * Route: /api/core/designations
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

        let query = core.designations()
            .select(`
                *,
                companies:company_id (id, name)
            `)
            .eq('is_active', true)
            .order('level', { ascending: false });

        query = await applyTenantFilter(userId, query, { branchColumn: '' });

        const { data, error } = await query;
        if (error) throw new Error(error.message);

        return successResponse(data, `Designations fetched successfully (${data?.length || 0} records)`);

    } catch (error: any) {
        return errorResponse('INTERNAL_ERROR', error.message || 'Failed to fetch designations', 500);
    }
}

export async function POST(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse('UNAUTHORIZED', 'Unauthorized', 401);

        let data = await req.json();
        data = await autoAssignCompany(userId, data);

        // ⚡ LIMIT ENFORCEMENT: Check if company can add more designations
        const { canAddResource } = await import('@/lib/services/LimitService');
        const limitCheck = await canAddResource(data.company_id, 'designation');

        if (!limitCheck.allowed) {
            return errorResponse('LIMIT_REACHED', limitCheck.message, 403);
        }

        const code = data.code || data.designation_code;

        if (!data.title || !code) {
            return errorResponse('VALIDATION_ERROR', 'title and code are required', 400);
        }

        const designationData = {
            company_id: data.company_id,
            title: data.title,
            code: code, // Column is 'code' in DB
            description: data.description || null,
            level: Number(data.level) || 1,
            is_active: data.is_active !== false
        };

        console.log('Creating Designation:', designationData);

        const { data: record, error } = await core.designations()
            .insert(designationData)
            .select('*, companies:company_id (id, name)')
            .single();

        if (error) {
            console.error('Desig DB Error:', error);
            throw new Error(error.message);
        }

        return successResponse(record, 'Designation created successfully', 201);

    } catch (error: any) {
        console.error('Desig Create Error:', error);
        return errorResponse('INTERNAL_ERROR', error.message || 'Failed to create designation', 500);
    }
}
