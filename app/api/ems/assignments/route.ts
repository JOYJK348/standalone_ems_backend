import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/errorHandler';
import { getUserTenantScope, autoAssignCompany } from '@/middleware/tenantFilter';
import { getUserIdFromToken } from '@/lib/jwt';
import { AssignmentService } from '@/lib/services/AssignmentService';
import { ems } from '@/lib/supabase';

import { EMSNotificationTriggers } from '@/lib/services/EMSNotificationTriggers';
import { NotificationService } from '@/lib/services/NotificationService';
import { requireMenuAccessAppRouter } from '@/lib/menuAccessAppRouter';

export async function GET(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse(null, 'Unauthorized', 401);

        const menuAccess = await requireMenuAccessAppRouter(req, 'ems.assignments');
        if (menuAccess instanceof Response) return menuAccess;

        const scope = await getUserTenantScope(userId);

        let courseIds: number[] | undefined = undefined;
        if (scope.emsProfile?.profileType === 'tutor' && scope.emsProfile.profileId) {
            // Get tutor's assigned courses
            const { data: junctionMappings } = await ems.courseTutors()
                .select('course_id')
                .eq('tutor_id', scope.emsProfile.profileId)
                .is('deleted_at', null);

            const { data: legacyCourses } = await ems.courses()
                .select('id')
                .eq('tutor_id', scope.emsProfile.profileId)
                .is('deleted_at', null);

            courseIds = [
                ...(junctionMappings?.map((m: any) => m.course_id) || []),
                ...(legacyCourses?.map((c: any) => c.id) || [])
            ];
        } else if (scope.emsProfile?.profileType === 'student' && scope.emsProfile.profileId) {
            // Get student's enrolled courses
            const { data: enrollments } = await ems.enrollments()
                .select('course_id')
                .eq('student_id', scope.emsProfile.profileId)
                .eq('enrollment_status', 'ACTIVE')
                .is('deleted_at', null);

            courseIds = enrollments?.map((e: any) => e.course_id) || [];
            if (courseIds.length === 0) {
                return successResponse([], 'No enrolled courses found');
            }
        }

        const { searchParams } = new URL(req.url);
        const batchId = searchParams.get('batchId') ? parseInt(searchParams.get('batchId')!) : undefined;

        const data = await AssignmentService.getAllAssignments(scope.companyId!, courseIds, batchId);

        return successResponse(data, 'Assignments fetched successfully');
    } catch (error: any) {
        console.error('Error in GET assignments:', error);
        return errorResponse(null, error.message || 'Failed to fetch assignments');
    }
}


export async function POST(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse(null, 'Unauthorized', 401);

        const menuAccess = await requireMenuAccessAppRouter(req, 'ems.assignments');
        if (menuAccess instanceof Response) return menuAccess;

        let body = await req.json();
        const scope = await getUserTenantScope(userId);
        console.log(`[POST /ems/assignments] User: ${userId}, Company: ${scope.companyId}`);

        // Auto-assign Tutor if not provided (get from course)
        let tutorId = scope.emsProfile?.profileType === 'tutor' ? scope.emsProfile.profileId : body.tutor_id || null;
        if (!tutorId && body.course_id) {
            const { data: course } = await ems.courses()
                .select('tutor_id')
                .eq('id', parseInt(body.course_id))
                .single();
            tutorId = course?.tutor_id || null;
            console.log(`[POST /ems/assignments] Auto-assigned Tutor: ${tutorId}`);
        }

        // Data cleaning: Extract only valid columns for ems.assignments
        const insertData = {
            company_id: scope.companyId,
            course_id: body.course_id ? parseInt(body.course_id) : null,
            batch_id: body.batch_id ? parseInt(body.batch_id) : null,
            assignment_title: body.assignment_title,
            assignment_description: (body.assignment_description || '') + (body.instructions ? `\n\nInstructions:\n${body.instructions}` : ''),
            submission_mode: body.submission_mode || 'ONLINE',
            max_marks: body.max_marks ? parseInt(body.max_marks) : 100,
            deadline: body.deadline && body.deadline !== "" ? body.deadline : null,
            tutor_id: tutorId,
            is_active: true
        };

        console.log('[POST /ems/assignments] Inserting:', insertData);

        const assignment = await AssignmentService.createAssignment(insertData);
        console.log(`[POST /ems/assignments] Created ID: ${assignment.id}`);

        // 1. Notify Creator (Success Confirmation)
        try {
            console.log(`[POST /ems/assignments] Notifying Creator ${userId}`);
            await NotificationService.send({
                userId: userId,
                companyId: scope.companyId!,
                product: 'EMS',
                module: 'assignments',
                title: '✅ Assignment Created',
                message: `Assignment "${body.assignment_title}" has been successfully created and published.`,
                type: 'SUCCESS',
                category: 'INFO',
                priority: 'NORMAL',
                actionUrl: '/ems/academic-manager/assignments'
            });
        } catch (notiErr) {
            console.error('[POST /ems/assignments] Creator Noti Failed:', notiErr);
        }

        // 2. Notify Tutor and Students via Trigger
        if (assignment && assignment.id) {
            console.log(`[POST /ems/assignments] Triggering Background Notis for ID: ${assignment.id}`);
            EMSNotificationTriggers.onAssignmentCreated(assignment.id, scope.companyId!).catch(err => {
                console.error('[POST /ems/assignments] Notification Trigger Error:', err);
            });
        }

        return successResponse(assignment, 'Assignment created successfully', 201);
    } catch (error: any) {
        console.error('❌ [POST /ems/assignments] Error:', error);
        return errorResponse(null, error.message || 'Failed to create assignment');
    }
}
