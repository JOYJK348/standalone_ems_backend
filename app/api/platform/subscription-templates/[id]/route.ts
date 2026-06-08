/**
 * Single Subscription Template API
 * Route: /api/platform/subscription-templates/[id]
 */

import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/errorHandler';
import { supabase } from '@/lib/supabase';
import { getUserIdFromToken } from '@/lib/jwt';
import { getUserTenantScope } from '@/middleware/tenantFilter';

// GET - Get single template
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse('UNAUTHORIZED', 'Unauthorized', 401);

        const { data, error } = await supabase
            .schema('core')
            .from('subscription_templates')
            .select('*')
            .eq('id', id)
            .single();

        if (error || !data) {
            return errorResponse('NOT_FOUND', 'Template not found', 404);
        }

        return successResponse(data, 'Template fetched successfully');
    } catch (error: any) {
        return errorResponse('INTERNAL_ERROR', error.message, 500);
    }
}

// PATCH - Update template
export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse('UNAUTHORIZED', 'Unauthorized', 401);

        const scope = await getUserTenantScope(userId);
        if (scope.roleLevel < 5) {
            return errorResponse('FORBIDDEN', 'Only Platform Admin can update templates', 403);
        }

        const body = await req.json();

        const updateData: any = {
            updated_at: new Date().toISOString(),
            updated_by: userId
        };

        // Allowed update fields
        const allowedFields = [
            'name', 'display_name', 'description', 'monthly_price', 'yearly_price',
            'setup_fee', 'max_users', 'max_employees', 'max_branches',
            'max_departments', 'max_designations', 'enabled_modules',
            'allowed_menu_ids', 'features', 'support_level', 'trial_days',
            'validity_days', 'is_active', 'is_published'
        ];

        for (const field of allowedFields) {
            if (body[field] !== undefined) {
                updateData[field] = body[field];
            }
        }

        const { data, error } = await supabase
            .schema('core')
            .from('subscription_templates')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (error) throw new Error(error.message);
        if (!data) return errorResponse('NOT_FOUND', 'Template not found', 404);

        return successResponse(data, 'Template updated successfully');
    } catch (error: any) {
        return errorResponse('INTERNAL_ERROR', error.message, 500);
    }
}

// DELETE - Delete template
export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse('UNAUTHORIZED', 'Unauthorized', 401);

        const scope = await getUserTenantScope(userId);
        if (scope.roleLevel < 5) {
            return errorResponse('FORBIDDEN', 'Only Platform Admin can delete templates', 403);
        }

        // Check if template is in use
        const { count } = await supabase
            .schema('core')
            .from('companies')
            .select('id', { count: 'exact', head: true })
            .eq('subscription_template_id', id);

        if (count && count > 0) {
            return errorResponse('CONFLICT', `Cannot delete template: ${count} companies are using it`, 409);
        }

        const { error } = await supabase
            .schema('core')
            .from('subscription_templates')
            .delete()
            .eq('id', id);

        if (error) throw new Error(error.message);

        return successResponse(null, 'Template deleted successfully');
    } catch (error: any) {
        return errorResponse('INTERNAL_ERROR', error.message, 500);
    }
}
