/**
 * EMS API - My Assignments
 * Route: /api/ems/students/my-assignments
 */

import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/errorHandler';
import { getUserIdFromToken } from '@/lib/jwt';
import { ems } from '@/lib/supabase';
import { AssignmentService } from '@/lib/services/AssignmentService';
import { requireMenuAccessAppRouter } from '@/lib/menuAccessAppRouter';

export async function GET(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse(null, 'Unauthorized', 401);

        const menuAccess = await requireMenuAccessAppRouter(req, 'ems.students.assignments');
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

        // Get student enrolled course IDs
        const { data: enrollments } = await ems.enrollments()
            .select('course_id')
            .eq('student_id', student.id)
            .eq('company_id', scope.companyId!)
            .eq('enrollment_status', 'ACTIVE')
            .is('deleted_at', null) as any;

        const courseIds = (enrollments as any[])?.map((e: any) => e.course_id) || [];

        if (courseIds.length === 0) {
            return successResponse([], 'No assignments found (no enrolled courses)');
        }

        const data = await AssignmentService.getStudentAssignments(student.id, scope.companyId!);

        // Map status to match frontend expectations (pending, submitted, graded)
        const mappedAssignments = data.map((a: any) => ({
            ...a,
            status: a.submission_status === 'GRADED' ? 'graded' :
                a.submission_status === 'SUBMITTED' ? 'submitted' : 'pending',
            score: a.marks_obtained,
            course_name: a.courses?.course_name
        }));

        return successResponse(mappedAssignments, 'My assignments fetched successfully');

    } catch (error: any) {
        console.error('My Assignments Error:', error);
        return errorResponse(null, error.message || 'Failed to fetch your assignments');
    }
}
