import { NextRequest } from 'next/server';
import { core } from '@/lib/supabase';
import { getUserIdFromToken } from '@/lib/jwt';
import { getUserTenantScope } from '@/middleware/tenantFilter';
import { successResponse, errorResponse } from '@/lib/errorHandler';

/**
 * GET /api/platform/subscriptions
 * Fetch all available subscription plans
 */
export async function GET() {
    try {
        const { data, error } = await core.subscriptionPlans()
            .select('*')
            .order('monthly_price', { ascending: true });

        if (error) return errorResponse('DATABASE_ERROR', error.message, 500);
        return successResponse(data);
    } catch (err: any) {
        return errorResponse('INTERNAL_SERVER_ERROR', err.message, 500);
    }
}

/**
 * POST /api/platform/subscriptions
 * Create a new subscription plan (Platform Admin only)
 */
export async function POST(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse('UNAUTHORIZED', 'Authentication required', 401);

        const scope = await getUserTenantScope(userId);
        if (scope.roleLevel < 5) {
            return errorResponse('FORBIDDEN', 'Only Platform Admins can manage subscription plans', 403);
        }

        const body = await req.json();

        // Validation
        if (!body.name || !body.display_name) {
            return errorResponse('VALIDATION_ERROR', 'Plan name and display name are required', 400);
        }

        const { data, error } = await core.subscriptionPlans()
            .insert([{
                ...body,
                created_by: userId,
                updated_at: new Date().toISOString()
            }])
            .select()
            .single();

        if (error) return errorResponse('DATABASE_ERROR', error.message, 500);
        return successResponse(data, 'Subscription plan created');
    } catch (err: any) {
        return errorResponse('INTERNAL_SERVER_ERROR', err.message, 500);
    }
}
