/**
 * CORE API - Locations (Multi-Tenant)
 * Route: /api/core/locations
 */

import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/errorHandler';
import { supabase } from '@/lib/supabase';
import { applyTenantFilter, autoAssignCompany } from '@/middleware/tenantFilter';
import { getUserIdFromToken } from '@/lib/jwt';

export async function GET(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse(null, 'Unauthorized', 401);

        let query = supabase
            .from('locations')
            .select(`
                *,
                company:company_id (id, name),
                branch:branch_id (id, name),
                city:city_id (id, name)
            `)
            .order('name');

        query = await applyTenantFilter(userId, query);

        const { data, error } = await query;
        if (error) throw new Error(error.message);

        return successResponse(data, `Locations fetched successfully (${data?.length || 0} records)`);

    } catch (error: any) {
        return errorResponse(null, error.message || 'Failed to fetch locations');
    }
}

export async function POST(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse(null, 'Unauthorized', 401);

        let data = await req.json();
        data = await autoAssignCompany(userId, data);

        if (!data.name || !data.branch_id) {
            return errorResponse(null, 'name and branch_id are required', 400);
        }

        const { data: record, error } = await supabase
            .from('locations')
            .insert(data)
            .select(`
                *,
                branch:branch_id (id, name),
                city:city_id (id, name)
            `)
            .single();

        if (error) throw new Error(error.message);

        return successResponse(record, 'Location created successfully', 201);

    } catch (error: any) {
        return errorResponse(null, error.message || 'Failed to create location');
    }
}
