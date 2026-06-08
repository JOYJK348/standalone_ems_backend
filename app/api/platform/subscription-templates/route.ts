/**
 * Subscription Templates API
 * Manages custom subscription plan templates
 * Route: /api/platform/subscription-templates
 */

import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/errorHandler';
import { supabase } from '@/lib/supabase';
import { getUserIdFromToken } from '@/lib/jwt';
import { getUserTenantScope } from '@/middleware/tenantFilter';

// GET - List all subscription templates
export async function GET(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse('UNAUTHORIZED', 'Unauthorized', 401);

        const scope = await getUserTenantScope(userId);

        let query = supabase
            .schema('core')
            .from('subscription_templates')
            .select('*');

        // Platform Admin (Level 5+) can see everything
        // Others can only see ACTIVE and PUBLISHED plans
        if (scope.roleLevel < 5) {
            query = query.eq('is_active', true).eq('is_published', true);
        }

        const { data, error } = await query.order('created_at', { ascending: false });

        if (error) throw new Error(error.message);

        return successResponse(data, `Fetched ${data?.length || 0} subscription templates`);
    } catch (error: any) {
        return errorResponse('INTERNAL_ERROR', error.message, 500);
    }
}

// POST - Create a new custom subscription template
export async function POST(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse('UNAUTHORIZED', 'Unauthorized', 401);

        const scope = await getUserTenantScope(userId);
        if (scope.roleLevel < 5) {
            return errorResponse('FORBIDDEN', 'Only Platform Admin can create subscription templates', 403);
        }

        const body = await req.json();

        // Validate required fields
        if (!body.name || !body.code) {
            return errorResponse('VALIDATION_ERROR', 'Name and code are required', 400);
        }

        // Generate code if not provided
        const code = body.code || `CUSTOM-${Date.now()}`;

        const templateData = {
            name: body.name,
            code,
            display_name: body.display_name || body.name,
            description: body.description,
            template_type: body.template_type || 'CUSTOM',
            base_plan: body.base_plan,
            monthly_price: body.monthly_price || 0,
            yearly_price: body.yearly_price || 0,
            setup_fee: body.setup_fee || 0,
            max_users: body.max_users || 10,
            max_employees: body.max_employees || 10,
            max_branches: body.max_branches || 1,
            max_departments: body.max_departments || 5,
            max_designations: body.max_designations || 5,
            enabled_modules: body.enabled_modules || [],
            allowed_menu_ids: body.allowed_menu_ids || [],
            features: body.features || [],
            support_level: body.support_level || 'EMAIL',
            trial_days: body.trial_days || 0,
            validity_days: body.validity_days || 365,
            is_active: body.is_active !== false,
            is_published: body.is_published === true,
            created_by: userId
        };

        const { data, error } = await supabase
            .schema('core')
            .from('subscription_templates')
            .insert(templateData)
            .select()
            .single();

        if (error) {
            if (error.code === '23505') {
                return errorResponse('CONFLICT', `Template with code '${code}' already exists`, 409);
            }
            throw new Error(error.message);
        }

        return successResponse(data, 'Subscription template created successfully', 201);
    } catch (error: any) {
        return errorResponse('INTERNAL_ERROR', error.message, 500);
    }
}
