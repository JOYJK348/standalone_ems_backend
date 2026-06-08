/**
 * EMS API - Tutor Dashboard
 * Route: /api/ems/tutor/dashboard
 */

import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/errorHandler';
import { getUserIdFromToken } from '@/lib/jwt';
import { AssessmentService } from '@/lib/services/AssessmentService';
import { ems } from '@/lib/supabase';
import { getUserTenantScope } from '@/middleware/tenantFilter';
import { dataCache } from '@/lib/cache/dataCache';
import { requireMenuAccessAppRouter } from '@/lib/menuAccessAppRouter';

export async function GET(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse(null, 'Unauthorized', 401);
        const menuAccess = await requireMenuAccessAppRouter(req, 'ems.dashboard.tutor');
        if (menuAccess instanceof Response) return menuAccess;

        const scope = await getUserTenantScope(userId);

        // 🚀 CACHE CHECK
        const cacheKey = `tutor_dashboard:${userId}:${scope.companyId}`;
        const cachedData = await dataCache.get(cacheKey);
        if (cachedData) {
            return successResponse(cachedData, 'Tutor dashboard (cached)');
        }

        const tutorId = scope.emsProfile?.profileId;

        if (!tutorId || scope.emsProfile?.profileType !== 'tutor') {
            return errorResponse(null, 'Tutor profile not found or access denied', 404);
        }

        // Get pending assignments for grading
        const pendingAssignments = await AssessmentService.getPendingAssignments(
            tutorId,
            scope.companyId!
        );

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // MULTI-TUTOR COURSE FETCHING
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

        // 1. Get Course IDs from junction table
        const { data: junctionMappings } = await ems.courseTutors()
            .select('course_id')
            .eq('tutor_id', tutorId)
            .is('deleted_at', null);

        // 2. Get Course IDs from legacy tutor_id column
        const { data: legacyCourses } = await ems.courses()
            .select('id')
            .eq('tutor_id', tutorId)
            .eq('company_id', scope.companyId!)
            .is('deleted_at', null);

        const assignedCourseIds = [
            ...(junctionMappings?.map((m: any) => m.course_id) || []),
            ...(legacyCourses?.map((c: any) => c.id) || [])
        ];

        const uniqueCourseIds = [...new Set(assignedCourseIds)];

        let coursesWithStats: any[] = [];
        let liveClasses: any[] = [];

        if (uniqueCourseIds.length > 0) {
            // Get tutor's courses details
            const { data: courses } = await ems.courses()
                .select(`
                    id, 
                    course_name, 
                    course_code, 
                    total_lessons, 
                    is_published,
                    course_modules(id)
                `)
                .in('id', uniqueCourseIds)
                .eq('company_id', scope.companyId!)
                .eq('is_active', true);

            // Transform module count
            coursesWithStats = courses?.map((c: any) => ({
                ...c,
                modules_count: c.course_modules?.length || 0
            })) || [];

            // Get today's live classes
            const today = new Date().toISOString().split('T')[0];
            const { data: classes } = await ems.supabase
                .schema('ems')
                .from('live_classes')
                .select('id, class_title, scheduled_date, start_time, end_time, duration_minutes, meeting_platform, meeting_link, class_status, course_id, batch_id')
                .in('course_id', uniqueCourseIds)
                .gte('scheduled_date', today)
                .order('scheduled_date', { ascending: true })
                .limit(5);

            liveClasses = classes || [];
        }

        // Get count of quizzes for these courses
        const { count: quizCount } = await ems.quizzes()
            .select('*', { count: 'exact', head: true })
            .in('course_id', uniqueCourseIds)
            .is('deleted_at', null);

        // Get 3 most recently created quizzes
        const { data: recentQuizzes } = await ems.quizzes()
            .select(`
                id, 
                quiz_title, 
                total_marks, 
                duration_minutes,
                created_at,
                courses:course_id (course_name)
            `)
            .in('course_id', uniqueCourseIds)
            .is('deleted_at', null)
            .order('created_at', { ascending: false })
            .limit(3);

        // Get count of assignments for these courses
        const { count: assignmentCount } = await ems.assignments()
            .select('*', { count: 'exact', head: true })
            .in('course_id', uniqueCourseIds)
            .is('deleted_at', null);

        // Get 5 most recent notifications for the tutor
        const { data: notifications } = await ems.supabase
            .schema('ems')
            .from('notifications')
            .select('id, title, message, type, created_at, is_read')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(5);

        const dashboardData = {
            tutor_id: tutorId,
            pending_grading_count: pendingAssignments?.length || 0,
            pending_assignments: pendingAssignments,
            total_courses: coursesWithStats?.length || 0,
            total_quizzes: quizCount || 0,
            recent_quizzes: recentQuizzes || [],
            total_assignments: assignmentCount || 0,
            courses: coursesWithStats || [],
            upcoming_classes: liveClasses || [],
            recent_activities: notifications || [],
        };

        // 🚀 CACHE SET
        await dataCache.set(cacheKey, dashboardData, 60 * 1000); // 1 minute cache

        return successResponse(dashboardData, 'Tutor dashboard data fetched successfully');

    } catch (error: any) {
        return errorResponse(null, error.message || 'Failed to fetch dashboard data');
    }
}
