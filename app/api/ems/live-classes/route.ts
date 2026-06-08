/**
 * EMS API - Live Classes
 * Route: /api/ems/live-classes
 */

import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/errorHandler';
import { getUserIdFromToken } from '@/lib/jwt';
import { getUserTenantScope, autoAssignCompany } from '@/middleware/tenantFilter';
import { ems } from '@/lib/supabase';
import { requireMenuAccessAppRouter } from '@/lib/menuAccessAppRouter';

export async function GET(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse(null, 'Unauthorized', 401);

        const menuAccess = await requireMenuAccessAppRouter(req, 'ems.live_classes');
        if (menuAccess instanceof Response) return menuAccess;

        const scope = await getUserTenantScope(userId);
        if (!scope.companyId) return errorResponse(null, 'Company context required', 400);

        let query = ems.liveClasses()
            .select(`
                *,
                courses:course_id (course_name, course_code),
                batches:batch_id (batch_name),
                lessons:lesson_id (
                    id,
                    lesson_name,
                    materials:course_materials(*)
                )
            `)
            .eq('company_id', scope.companyId)
            .is('deleted_at', null)
            .order('scheduled_date', { ascending: true });

        // 🛡️ ROLE-BASED FILTERING
        // Academic Managers and Admins see everything for the company
        if (scope.roleLevel >= 2 || scope.roleName === 'ACADEMIC_MANAGER') {
            // Manager/Admin context - No profile-specific filtering needed
            console.log(`🛡️ [Live Classes] Manager/Admin access: ${scope.roleName} (L${scope.roleLevel})`);
        }
        else if (scope.emsProfile?.profileType === 'tutor' && scope.emsProfile.profileId) {
            query = query.eq('tutor_id', scope.emsProfile.profileId);
        }
        else if (scope.emsProfile?.profileType === 'student' && scope.emsProfile.profileId) {
            const { data: enrollments } = await ems.enrollments()
                .select('course_id, batch_id')
                .eq('student_id', scope.emsProfile.profileId)
                .eq('enrollment_status', 'ACTIVE')
                .is('deleted_at', null);

            if (!enrollments || enrollments.length === 0) {
                return successResponse([], 'No enrolled courses found');
            }

            const courseIds = enrollments.map(e => e.course_id);
            const batchIds = enrollments.map(e => e.batch_id).filter(id => id !== null);

            // Filter: Student must be in the course
            query = query.in('course_id', courseIds);

            // 🛡️ Batch-level isolation:
            // If the live class has a batch_id, student must be in THAT batch.
            // If batch_id is NULL, it's a global class for all students in the course.
            if (batchIds.length > 0) {
                // query.or(...) is safer to handle (batch matches OR batch is null)
                query = query.or(`batch_id.in.(${batchIds.join(',')}),batch_id.is.null`);
            } else {
                // If student has no batch, they only see NULL batch classes
                query = query.is('batch_id', null);
            }
        }

        const { data: rawData, error } = await query;
        if (error) throw error;

        // Map database names back to clean API names for frontend consistency
        const data = rawData?.map(item => ({
            ...item,
            status: item.class_status || item.status,
            external_link: item.meeting_link || item.external_link
        })) || [];

        return successResponse(data, 'Live classes fetched successfully');

    } catch (error: any) {
        console.error('💥 [Live Classes GET] Catch Block:', error);
        return errorResponse(null, error.message || 'Failed to fetch live classes');
    }
}

export async function POST(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse(null, 'Unauthorized', 401);

        const menuAccess = await requireMenuAccessAppRouter(req, 'ems.live_classes');
        if (menuAccess instanceof Response) return menuAccess;

        let data = await req.json();
        data = await autoAssignCompany(userId, data);
        const scope = await getUserTenantScope(userId);

        if (data.meeting_platform === 'JITSI' && !data.meeting_id) {
            const timestamp = Date.now().toString(36);
            data.meeting_id = `Agaran-C${scope.companyId}-${data.course_id}-${timestamp}`;
        }

        // Clean data before insert - convert "" to null for BIGINT columns
        // Mapping status -> class_status and external_link -> meeting_link for DB V2 alignment
        const toInsert: any = {
            class_title: data.class_title,
            class_description: data.class_description,
            company_id: scope.companyId,
            course_id: parseInt(data.course_id),
            batch_id: data.batch_id === "" ? null : parseInt(data.batch_id),
            tutor_id: parseInt(data.tutor_id),
            scheduled_date: data.scheduled_date,
            start_time: data.start_time,
            end_time: data.end_time,
            meeting_platform: data.meeting_platform,
            meeting_id: data.meeting_id,
            meeting_link: data.external_link || data.meeting_link,
            class_status: 'SCHEDULED'
        };

        console.log('🚀 [Live Classes] Sanitized data:', JSON.stringify(toInsert, null, 2));

        const { data: liveClass, error } = await ems.liveClasses()
            .insert(toInsert as any)
            .select()
            .single();

        if (error) {
            console.error('❌ [Live Classes POST] Supabase Error:', error);
            throw error;
        }

        // 🔔 AUTOMATION: Trigger notifications for Tutor and Students
        // We run this asynchronously so the API response isn't delayed
        const { EMSNotificationTriggers } = require('@/lib/services/EMSNotificationTriggers');
        EMSNotificationTriggers.onLiveClassScheduled(liveClass.id, scope.companyId).catch(console.error);

        // Map back for response
        const responseData = {
            ...liveClass,
            status: liveClass.class_status || liveClass.status,
            external_link: liveClass.meeting_link || liveClass.external_link
        };

        return successResponse(responseData, 'Live class scheduled successfully', 201);

    } catch (error: any) {
        console.error('💥 [Live Classes POST] Catch Block:', error);
        return errorResponse(null, error.message || 'Failed to schedule live class');
    }
}
