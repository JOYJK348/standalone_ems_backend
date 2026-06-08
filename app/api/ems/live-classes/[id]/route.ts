/**
 * EMS API - Single Live Class
 * Route: /api/ems/live-classes/[id]
 */

import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/errorHandler';
import { getUserIdFromToken } from '@/lib/jwt';
import { getUserTenantScope } from '@/middleware/tenantFilter';
import { ems } from '@/lib/supabase';
import { requireMenuAccessAppRouter } from '@/lib/menuAccessAppRouter';

export async function GET(
    req: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse(null, 'Unauthorized', 401);
        const menuAccess = await requireMenuAccessAppRouter(req, 'ems.live_classes.edit');
        if (menuAccess instanceof Response) return menuAccess;

        const { id } = await context.params;
        const classId = parseInt(id);
        const scope = await getUserTenantScope(userId);

        const { data, error } = await ems.liveClasses()
            .select(`
                *,
                courses:course_id (course_name, course_code),
                batches:batch_id (batch_name),
                tutors:tutor_id (first_name, last_name, email)
            `)
            .eq('id', classId)
            .eq('company_id', scope.companyId!)
            .is('deleted_at', null)
            .single();

        if (error) throw error;

        return successResponse(data, 'Live class fetched successfully');

    } catch (error: any) {
        console.error('[Live Class GET] Error:', error);
        return errorResponse(null, error.message || 'Failed to fetch live class');
    }
}

export async function PUT(
    req: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse(null, 'Unauthorized', 401);
        const menuAccess = await requireMenuAccessAppRouter(req, 'ems.live_classes.edit');
        if (menuAccess instanceof Response) return menuAccess;

        const { id } = await context.params;
        const classId = parseInt(id);
        const scope = await getUserTenantScope(userId);
        const updateData = await req.json();

        const { data, error } = await ems.liveClasses()
            .update({
                ...updateData,
                updated_at: new Date().toISOString()
            })
            .eq('id', classId)
            .eq('company_id', scope.companyId!)
            .select()
            .single();

        if (error) throw error;

        return successResponse(data, 'Live class updated successfully');

    } catch (error: any) {
        console.error('[Live Class PUT] Error:', error);
        return errorResponse(null, error.message || 'Failed to update live class');
    }
}

export async function DELETE(
    req: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse(null, 'Unauthorized', 401);
        const menuAccess = await requireMenuAccessAppRouter(req, 'ems.live_classes.edit');
        if (menuAccess instanceof Response) return menuAccess;

        const { id } = await context.params;
        const classId = parseInt(id);
        const scope = await getUserTenantScope(userId);

        const { error } = await ems.liveClasses()
            .update({
                deleted_at: new Date().toISOString(),
                deleted_by: userId,
                status: 'CANCELLED'
            })
            .eq('id', classId)
            .eq('company_id', scope.companyId!);

        if (error) throw error;

        return successResponse(null, 'Live class cancelled successfully');

    } catch (error: any) {
        console.error('[Live Class DELETE] Error:', error);
        return errorResponse(null, error.message || 'Failed to cancel live class');
    }
}
