import { NextRequest } from 'next/server';
import { core } from '@/lib/supabase';
import { getUserIdFromToken } from '@/lib/jwt';
import { getUserTenantScope } from '@/middleware/tenantFilter';
import { successResponse, errorResponse } from '@/lib/errorHandler';

/**
 * PATCH /api/platform/subscriptions/[id]
 * Update a subscription plan
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse('UNAUTHORIZED', 'Authentication required', 401);

        const scope = await getUserTenantScope(userId);
        if (scope.roleLevel < 5) {
            return errorResponse('FORBIDDEN', 'Only Platform Admins can manage subscription plans', 403);
        }

        const body = await req.json();
        const { data, error } = await core.subscriptionPlans()
            .update({
                ...body,
                updated_at: new Date().toISOString(),
                updated_by: userId
            })
            .eq('id', params.id)
            .select()
            .single();

        if (error) return errorResponse('DATABASE_ERROR', error.message, 500);
        return successResponse(data, 'Subscription plan updated');
    } catch (err: any) {
        return errorResponse('INTERNAL_SERVER_ERROR', err.message, 500);
    }
}

/**
 * DELETE /api/platform/subscriptions/[id]
 * Delete a subscription plan
 */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse('UNAUTHORIZED', 'Authentication required', 401);

        const scope = await getUserTenantScope(userId);
        if (scope.roleLevel < 5) {
            return errorResponse('FORBIDDEN', 'Only Platform Admins can manage subscription plans', 403);
        }

        // Check if plan is being used by any company before delete (optional but recommended)
        // For now, simple delete
        const { error } = await core.subscriptionPlans()
            .delete()
            .eq('id', params.id);

        if (error) return errorResponse('DATABASE_ERROR', error.message, 500);
        return successResponse(null, 'Subscription plan deleted');
    } catch (err: any) {
        return errorResponse('INTERNAL_SERVER_ERROR', err.message, 500);
    }
}
