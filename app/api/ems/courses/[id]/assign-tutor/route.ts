/**
 * EMS API - Assign Tutor to Course
 * Route: /api/ems/courses/[id]/assign-tutor
 */

import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/errorHandler';
import { getUserTenantScope } from '@/middleware/tenantFilter';
import { getUserIdFromToken } from '@/lib/jwt';
import { ems, core } from '@/lib/supabase';
import { requireMenuAccessAppRouter } from '@/lib/menuAccessAppRouter';

export async function PUT(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse(null, 'Unauthorized', 401);

        const menuAccess = await requireMenuAccessAppRouter(req, 'ems.courses.tutors.assign');
        if (menuAccess instanceof Response) return menuAccess;

        const scope = await getUserTenantScope(userId);
        if (!scope.companyId) {
            return errorResponse(null, 'Company context required', 400);
        }

        const courseId = parseInt(params.id);
        const body = await req.json();
        const { tutorId } = body;

        if (!tutorId) {
            return errorResponse(null, 'Tutor ID is required', 400);
        }

        // Verify the tutor exists and belongs to the same company
        const { data: tutor, error: tutorError } = await core.employees()
            .select('id, first_name, last_name, email')
            .eq('id', tutorId)
            .eq('company_id', scope.companyId)
            .eq('is_active', true)
            .single();

        if (tutorError || !tutor) {
            console.error('Error fetching tutor:', tutorError);
            return errorResponse(null, 'Tutor not found or inactive', 404);
        }

        // Update the course with the tutor
        const { data: updatedCourse, error: updateError } = await ems.courses()
            .update({
                tutor_id: tutorId,
                updated_at: new Date().toISOString(),
                updated_by: userId
            } as any)
            .eq('id', courseId)
            .eq('company_id', scope.companyId)
            .select()
            .single();

        if (updateError) {
            console.error('Error assigning tutor:', updateError);
            return errorResponse(null, 'Failed to assign tutor to course');
        }

        const tutorData: any = tutor;
        return successResponse(
            {
                course: updatedCourse,
                tutor: {
                    id: tutorData.id,
                    name: `${tutorData.first_name} ${tutorData.last_name}`,
                    email: tutorData.email
                }
            },
            'Tutor assigned successfully'
        );

    } catch (error: any) {
        console.error('Error in assign tutor:', error);
        return errorResponse(null, error.message || 'Failed to assign tutor');
    }
}

// Remove tutor assignment
export async function DELETE(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse(null, 'Unauthorized', 401);

        const menuAccess = await requireMenuAccessAppRouter(req, 'ems.courses.tutors.assign');
        if (menuAccess instanceof Response) return menuAccess;

        const scope = await getUserTenantScope(userId);
        if (!scope.companyId) {
            return errorResponse(null, 'Company context required', 400);
        }

        const courseId = parseInt(params.id);

        // Remove tutor assignment
        const { data: updatedCourse, error: updateError } = await ems.courses()
            .update({
                tutor_id: null,
                updated_at: new Date().toISOString(),
                updated_by: userId
            } as any)
            .eq('id', courseId)
            .eq('company_id', scope.companyId)
            .select()
            .single();

        if (updateError) {
            console.error('Error removing tutor:', updateError);
            return errorResponse(null, 'Failed to remove tutor assignment');
        }

        return successResponse(updatedCourse, 'Tutor removed successfully');

    } catch (error: any) {
        console.error('Error in remove tutor:', error);
        return errorResponse(null, error.message || 'Failed to remove tutor');
    }
}
