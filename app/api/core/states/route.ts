/**
 * CORE API - States (Master Data)
 * Route: /api/core/states
 */

import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/errorHandler';
import { core } from '@/lib/supabase';
import { getUserIdFromToken } from '@/lib/jwt';
import { getUserTenantScope } from '@/middleware/tenantFilter';

export async function GET(_req: NextRequest) {
    try {
        const { data, error } = await core.states()
            .select('*, country:country_id (name)')
            .eq('is_active', true)
            .order('name');

        if (error) throw new Error(error.message);

        return successResponse(data, 'States fetched successfully');
    } catch (error: any) {
        return errorResponse(null, error.message || 'Failed to fetch states');
    }
}

export async function POST(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse(null, 'Unauthorized', 401);

        const scope = await getUserTenantScope(userId);
        if (scope.roleLevel < 5) {
            return errorResponse(null, 'Permission Denied: Only Platform Admin can add master data', 403);
        }

        const data = await req.json();

        if (!data.name || !data.country_id) {
            return errorResponse(null, 'name and country_id are required', 400);
        }

        const { data: record, error } = await core.states()
            .insert(data)
            .select('*, country:country_id (name)')
            .single();

        if (error) throw new Error(error.message);

        return successResponse(record, 'State created successfully', 201);

    } catch (error: any) {
        return errorResponse(null, error.message || 'Failed to create state');
    }
}
