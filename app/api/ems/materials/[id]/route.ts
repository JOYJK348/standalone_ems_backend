import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/errorHandler';
import { getUserIdFromToken } from '@/lib/jwt';
import { getUserTenantScope } from '@/middleware/tenantFilter';
import { ems } from '@/lib/supabase';
import { courseMaterialSchema } from '@/lib/validations/ems';
import { z } from 'zod';
import { requireMenuAccessAppRouter } from '@/lib/menuAccessAppRouter';

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse(null, 'Unauthorized', 401);
        const menuAccess = await requireMenuAccessAppRouter(req, 'ems.materials.edit');
        if (menuAccess instanceof Response) return menuAccess;

        const id = parseInt(params.id);
        const scope = await getUserTenantScope(userId);
        const data = await req.json();

        // Fetch existing material to preserve company_id and validate ownership
        const { data: existingMaterial, error: fetchError } = await ems.courseMaterials()
            .select('*')
            .eq('id', id)
            .eq('company_id', scope.companyId!)
            .single();

        if (fetchError || !existingMaterial) {
            return errorResponse(null, 'Material not found or access denied', 404);
        }

        // Use partial validation - only validate fields that are being updated
        const updateSchema = courseMaterialSchema.partial().extend({
            company_id: z.coerce.number().optional(), // Make company_id optional for updates
        });

        const validatedData = updateSchema.parse(data);

        // Ensure company_id is preserved from existing material
        const updateData = {
            ...validatedData,
            company_id: existingMaterial.company_id,
        };

        const { data: material, error } = await ems.courseMaterials()
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        return successResponse(material, 'Material updated successfully');

    } catch (error: any) {
        console.error('Material PUT error:', error);
        if (error.name === 'ZodError') {
            console.error('Validation errors:', JSON.stringify(error.errors, null, 2));
            return errorResponse(error.errors, 'Validation failed', 400);
        }
        return errorResponse(null, error.message || 'Failed to update material', 500);
    }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse(null, 'Unauthorized', 401);
        const menuAccess = await requireMenuAccessAppRouter(req, 'ems.materials.edit');
        if (menuAccess instanceof Response) return menuAccess;

        const id = parseInt(params.id);

        const { error } = await ems.courseMaterials()
            .update({ deleted_at: new Date().toISOString() })
            .eq('id', id);

        if (error) throw error;

        return successResponse(null, 'Material deleted successfully');

    } catch (error: any) {
        console.error('Material DELETE error:', error);
        return errorResponse(null, error.message || 'Failed to delete material', 500);
    }
}
