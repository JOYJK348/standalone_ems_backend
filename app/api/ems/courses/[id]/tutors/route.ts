/**
 * EMS API - Multi-Tutor Assignment for Courses
 * Route: /api/ems/courses/[id]/tutors
 */

import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/errorHandler';
import { getUserTenantScope } from '@/middleware/tenantFilter';
import { getUserIdFromToken } from '@/lib/jwt';
import { ems, core, supabase } from '@/lib/supabase';
import { requireMenuAccessAppRouter } from '@/lib/menuAccessAppRouter';

// GET - Get all tutors assigned to a course
export async function GET(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse(null, 'Unauthorized', 401);

        const menuAccess = await requireMenuAccessAppRouter(req, 'ems.courses.tutors');
        if (menuAccess instanceof Response) return menuAccess;

        const scope = await getUserTenantScope(userId);
        if (!scope.companyId) {
            return errorResponse(null, 'Company context required', 400);
        }

        const courseId = parseInt(params.id);

        // Fetch course-tutor mappings
        const { data: courseTutors, error: mappingError } = await supabase
            .schema('ems')
            .from('course_tutors')
            .select('id, tutor_id, tutor_role, is_primary')
            .eq('course_id', courseId)
            .eq('company_id', scope.companyId)
            .is('deleted_at', null);

        if (mappingError) {
            console.error('Error fetching course tutors:', mappingError);
            throw mappingError;
        }

        if (!courseTutors || courseTutors.length === 0) {
            return successResponse([], 'No tutors assigned to this course');
        }

        // Get tutor IDs
        const tutorIds = courseTutors.map((ct: any) => ct.tutor_id);

        // Fetch tutor details from core schema
        const { data: tutors, error: tutorsError } = await core.employees()
            .select('id, first_name, last_name, email, employee_code')
            .in('id', tutorIds)
            .eq('company_id', scope.companyId);

        if (tutorsError) {
            console.error('Error fetching tutors:', tutorsError);
            throw tutorsError;
        }

        // Combine data
        const tutorsMap = new Map(tutors?.map((t: any) => [t.id, t]) || []);
        const result = courseTutors.map((ct: any) => {
            const tutor = tutorsMap.get(ct.tutor_id);
            return {
                id: ct.id,
                tutorId: ct.tutor_id,
                name: tutor ? `${tutor.first_name} ${tutor.last_name}` : 'Unknown',
                email: tutor?.email,
                employeeCode: tutor?.employee_code,
                role: ct.tutor_role,
                isPrimary: ct.is_primary
            };
        });

        return successResponse(result, 'Course tutors fetched successfully');

    } catch (error: any) {
        console.error('Error fetching course tutors:', error);
        return errorResponse(null, error.message || 'Failed to fetch course tutors');
    }
}

// POST - Add tutor(s) to a course
export async function POST(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse(null, 'Unauthorized', 401);

        const menuAccess = await requireMenuAccessAppRouter(req, 'ems.courses.tutors');
        if (menuAccess instanceof Response) return menuAccess;

        const scope = await getUserTenantScope(userId);
        if (!scope.companyId) {
            return errorResponse(null, 'Company context required', 400);
        }

        const courseId = parseInt(params.id);
        const body = await req.json();
        const { tutorIds, isPrimary = false, role = 'INSTRUCTOR' } = body;

        if (!tutorIds || !Array.isArray(tutorIds) || tutorIds.length === 0) {
            return errorResponse(null, 'Tutor IDs array is required', 400);
        }

        // Verify all tutors exist
        const { data: tutors, error: tutorsError } = await core.employees()
            .select('id')
            .in('id', tutorIds)
            .eq('company_id', scope.companyId)
            .eq('is_active', true);

        if (tutorsError || !tutors || tutors.length !== tutorIds.length) {
            return errorResponse(null, 'One or more tutors not found or inactive', 404);
        }

        // If setting as primary, remove primary flag from others
        if (isPrimary) {
            await supabase
                .schema('ems')
                .from('course_tutors')
                .update({ is_primary: false })
                .eq('course_id', courseId)
                .eq('company_id', scope.companyId)
                .is('deleted_at', null);
        }

        // Insert course-tutor mappings
        const mappings = tutorIds.map((tutorId: number, index: number) => ({
            company_id: scope.companyId,
            course_id: courseId,
            tutor_id: tutorId,
            tutor_role: role,
            is_primary: isPrimary && index === 0, // Only first one is primary
            created_by: userId
        }));

        const { data: inserted, error: insertError } = await supabase
            .schema('ems')
            .from('course_tutors')
            .upsert(mappings, {
                onConflict: 'course_id,tutor_id',
                ignoreDuplicates: false
            })
            .select();

        if (insertError) {
            console.error('Error assigning tutors:', insertError);
            return errorResponse(null, 'Failed to assign tutors to course');
        }

        return successResponse(inserted, `${tutorIds.length} tutor(s) assigned successfully`, 201);

    } catch (error: any) {
        console.error('Error assigning tutors:', error);
        return errorResponse(null, error.message || 'Failed to assign tutors');
    }
}

// DELETE - Remove tutor from course
export async function DELETE(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse(null, 'Unauthorized', 401);

        const menuAccess = await requireMenuAccessAppRouter(req, 'ems.courses.tutors');
        if (menuAccess instanceof Response) return menuAccess;

        const scope = await getUserTenantScope(userId);
        if (!scope.companyId) {
            return errorResponse(null, 'Company context required', 400);
        }

        const courseId = parseInt(params.id);
        const { searchParams } = new URL(req.url);
        const tutorId = searchParams.get('tutorId');

        if (!tutorId) {
            return errorResponse(null, 'Tutor ID is required', 400);
        }

        // Soft delete the mapping
        const { error: deleteError } = await supabase
            .schema('ems')
            .from('course_tutors')
            .update({
                deleted_at: new Date().toISOString(),
                deleted_by: userId
            })
            .eq('course_id', courseId)
            .eq('tutor_id', parseInt(tutorId))
            .eq('company_id', scope.companyId)
            .is('deleted_at', null);

        if (deleteError) {
            console.error('Error removing tutor:', deleteError);
            return errorResponse(null, 'Failed to remove tutor from course');
        }

        return successResponse(null, 'Tutor removed successfully');

    } catch (error: any) {
        console.error('Error removing tutor:', error);
        return errorResponse(null, error.message || 'Failed to remove tutor');
    }
}
