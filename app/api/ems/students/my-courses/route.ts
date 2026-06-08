/**
 * EMS API - My Enrolled Courses
 * Route: /api/ems/students/my-courses
 */

import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/errorHandler';
import { getUserIdFromToken } from '@/lib/jwt';
import { EnrollmentService } from '@/lib/services/EnrollmentService';
import { ems } from '@/lib/supabase';
import { requireMenuAccessAppRouter } from '@/lib/menuAccessAppRouter';

export async function GET(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse(null, 'Unauthorized', 401);

        const menuAccess = await requireMenuAccessAppRouter(req, 'ems.students.courses');
        if (menuAccess instanceof Response) return menuAccess;

        const scope = await import('@/middleware/tenantFilter').then(m =>
            m.getUserTenantScope(userId)
        );

        // Get student record
        const { data: student } = await ems.students()
            .select('id')
            .eq('user_id', userId)
            .eq('company_id', scope.companyId!)
            .is('deleted_at', null)
            .single();

        if (!student) {
            return errorResponse(null, 'Student record not found', 404);
        }

        // Get student enrollments with course and batch details
        const { data: enrollments, error } = await ems.enrollments()
            .select(`
                id,
                enrollment_date,
                enrollment_status,
                completion_percentage,
                total_lessons,
                lessons_completed,
                course:courses (
                    id,
                    course_code,
                    course_name,
                    course_description,
                    course_level,
                    thumbnail_url,
                    duration_hours,
                    total_lessons
                ),
                batch:batches (
                    id,
                    batch_code,
                    batch_name,
                    start_time,
                    end_time
                )
            `)
            .eq('student_id', student.id)
            .eq('company_id', scope.companyId!)
            .eq('enrollment_status', 'ACTIVE')
            .is('deleted_at', null) as any;

        if (error) throw error;

        return successResponse(enrollments || [], 'My courses fetched successfully');

    } catch (error: any) {
        console.error('My Courses Error:', error);
        return errorResponse(null, error.message || 'Failed to fetch your courses');
    }
}
