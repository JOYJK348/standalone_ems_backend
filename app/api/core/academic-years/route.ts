/**
 * CORE API - Academic Years (Multi-Tenant)
 * Route: /api/core/academic-years
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
            .from('academic_years')
            .select('*')
            .order('start_date', { ascending: false });

        query = await applyTenantFilter(userId, query);

        const { data, error } = await query;
        if (error) throw new Error(error.message);

        return successResponse(data, `Academic years fetched successfully (${data?.length || 0} records)`);

    } catch (error: any) {
        return errorResponse(null, error.message || 'Failed to fetch academic years');
    }
}

export async function POST(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse(null, 'Unauthorized', 401);

        let data = await req.json();
        data = await autoAssignCompany(userId, data);

        if (!data.name || !data.start_date || !data.end_date) {
            return errorResponse(null, 'name, start_date and end_date are required', 400);
        }

        const { data: record, error } = await supabase
            .from('academic_years')
            .insert(data)
            .select()
            .single();

        if (error) throw new Error(error.message);

        return successResponse(record, 'Academic year created successfully', 201);

    } catch (error: any) {
        return errorResponse(null, error.message || 'Failed to create academic year');
    }
}
