import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/errorHandler';
import { getUserIdFromToken } from '@/lib/jwt';
import { ems, app_auth } from '@/lib/supabase';
import { getUserTenantScope } from '@/middleware/tenantFilter';
import { dataCache } from '@/lib/cache/dataCache';
import { AttendanceService } from '@/lib/services/AttendanceService';
import { requireMenuAccessAppRouter } from '@/lib/menuAccessAppRouter';

async function fetchEnrollments(studentId: number, companyId: number) {
    try {
        const { data, error } = await ems.enrollments()
            .select(`
                id, course_id, batch_id, enrollment_date, enrollment_status,
                completion_percentage, total_lessons, lessons_completed,
                course:courses (id, course_code, course_name, thumbnail_url, course_level),
                batch:batches (id, batch_name)
            `)
            .eq('student_id', studentId)
            .eq('company_id', companyId)
            .in('enrollment_status', ['ACTIVE', 'PENDING', 'ENROLLED'])
            .is('deleted_at', null) as any;
        if (error) throw error;
        return data || [];
    } catch {
        const { data } = await ems.enrollments()
            .select('id, course_id, batch_id')
            .eq('student_id', studentId).eq('company_id', companyId).is('deleted_at', null) as any;
        return data || [];
    }
}

async function fetchAssignmentsWithStatus(courseIds: number[], companyId: number, studentId: number) {
    if (!courseIds.length) return [];
    try {
        const { data: assignments, error } = await ems.assignments()
            .select(`id, assignment_title, deadline, course:courses(id, course_name)`)
            .in('course_id', courseIds).eq('company_id', companyId)
            .eq('is_active', true).is('deleted_at', null).limit(10) as any;
        if (error) throw error;
        if (!assignments?.length) return [];

        const ids = assignments.map((a: any) => a.id);
        const { data: submissions } = await ems.assignmentSubmissions()
            .select('id, assignment_id, submission_status')
            .in('assignment_id', ids).eq('student_id', studentId) as any;

        const map = new Map((submissions || []).map((s: any) => [s.assignment_id, s]));
        return assignments.map((a: any) => ({
            ...a, status: map.get(a.id)?.submission_status || 'NOT_SUBMITTED'
        }));
    } catch {
        return [];
    }
}

async function fetchQuizzesWithStatus(courseIds: number[], companyId: number, studentId: number) {
    if (!courseIds.length) return [];
    try {
        const { data: quizzes, error } = await ems.quizzes()
            .select('id, quiz_title, max_attempts')
            .in('course_id', courseIds).eq('company_id', companyId)
            .eq('is_active', true).is('deleted_at', null) as any;
        if (error) throw error;
        if (!quizzes?.length) return [];

        const ids = quizzes.map((q: any) => q.id);
        const { data: attempts } = await ems.quizAttempts()
            .select('quiz_id, status').in('quiz_id', ids).eq('student_id', studentId) as any;

        const counts = new Map();
        (attempts || []).forEach((a: any) => counts.set(a.quiz_id, (counts.get(a.quiz_id) || 0) + 1));
        return quizzes.map((q: any) => ({ ...q, attempts_taken: counts.get(q.id) || 0 }));
    } catch {
        return [];
    }
}

async function fetchLiveClasses(courseIds: number[], batchIds: number[], companyId: number) {
    if (!courseIds.length) return [];
    try {
        let query = ems.liveClasses()
            .select(`id, class_title, scheduled_date, start_time, batch_id, course_id, meeting_link, meeting_platform, class_status, course:courses(id,course_name), batch:batches(id,batch_name)`)
            .eq('company_id', companyId).in('course_id', courseIds)
            .gte('scheduled_date', new Date().toISOString().split('T')[0])
            .is('deleted_at', null);

        if (batchIds.length) {
            query = query.or(`batch_id.in.(${batchIds.join(',')}),batch_id.is.null`);
        } else {
            query = query.is('batch_id', null);
        }

        const { data, error } = await query.order('scheduled_date').order('start_time') as any;
        if (error) throw error;
        return (data || []).map((lc: any) => ({
            ...lc, status: lc.class_status || 'SCHEDULED', external_link: lc.meeting_link
        })).slice(0, 5);
    } catch {
        return [];
    }
}

async function fetchAttendance(companyId: number, studentId: number) {
    try {
        return await AttendanceService.getStudentActiveSessionsWithStatus(companyId, studentId);
    } catch {
        return [];
    }
}

async function fetchRecentMaterials(courseIds: number[], companyId: number) {
    if (!courseIds.length) return [];
    try {
        const { data } = await ems.courseMaterials()
            .select(`id, material_name, material_type, file_url, created_at, course:courses(id,course_name)`)
            .in('course_id', courseIds).eq('company_id', companyId)
            .eq('is_active', true)
            .or('target_audience.eq.STUDENTS,target_audience.eq.BOTH,target_audience.is.null')
            .order('created_at', { ascending: false }).limit(6) as any;
        return data || [];
    } catch {
        return [];
    }
}

async function fetchAvailableCourses(companyId: number, enrolledCourseIds: number[]) {
    try {
        let query = ems.courses()
            .select('id, course_name, course_code, course_description, thumbnail_url, total_lessons, course_level, duration_hours, course_category')
            .eq('company_id', companyId).eq('is_published', true).is('deleted_at', null);
        if (enrolledCourseIds.length) {
            query = query.not('id', 'in', `(${enrolledCourseIds.join(',')})`);
        }
        const { data } = await query.limit(10) as any;
        return data || [];
    } catch {
        return [];
    }
}

export async function GET(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse(null, 'Unauthorized', 401);

        const cacheKey = `ems_student_dashboard:${userId}`;
        const cached = await dataCache.get(cacheKey);
        if (cached) return successResponse(cached, 'Student dashboard loaded (cached)');

        const menuAccess = await requireMenuAccessAppRouter(req, 'ems.dashboard.student');
        if (menuAccess instanceof Response) return menuAccess;

        const scope = await getUserTenantScope(userId);

        const { data: authUser } = await app_auth.users()
            .select(`id, email, first_name, last_name, user_roles(roles(name))`)
            .eq('id', userId).maybeSingle();

        let student: any;
        try {
            const { data: ds } = await ems.students()
                .select('id, company_id, first_name, last_name, email, student_code')
                .eq('user_id', userId as any).is('deleted_at', null).maybeSingle();
            student = ds;
            if (!student && authUser?.email) {
                const { data: sbe } = await ems.students()
                    .select('id, company_id, first_name, last_name, email, student_code')
                    .eq('email', authUser.email).is('deleted_at', null).maybeSingle();
                student = sbe;
            }
        } catch { }

        if (!student) {
            const hasStudentRole = ((authUser as any)?.user_roles || [])
                .some((row: any) => row.roles?.name === 'STUDENT');
            if (!hasStudentRole) {
                return errorResponse(null, 'Student profile not found. Please contact your administrator.', 404);
            }
            const name = [authUser?.first_name, authUser?.last_name].filter(Boolean).join(' ') || authUser?.email || 'Student';
            const empty = { student: { id: userId, name, student_code: '', email: authUser?.email || '', profile_linked: false }, stats: { total_courses: 0, active_assignments: 0, pending_quizzes: 0, upcoming_classes: 0, average_progress: 0 }, enrolled_courses: [], available_courses: [], pending_assignments: [], upcoming_quizzes: [], upcoming_live_classes: [], active_attendance_sessions: [], recent_materials: [] };
            return successResponse(empty, 'Student dashboard loaded without linked student profile');
        }

        const studentId = (student as any).id;
        const companyId = (student as any).company_id;

        // Phase 1: enrollments + attendance + available (no exclusions yet) in parallel
        const [enrollments, activeSessions, availRaw] = await Promise.all([
            fetchEnrollments(studentId, companyId),
            fetchAttendance(companyId, studentId),
            fetchAvailableCourses(companyId, [])
        ]);

        const courseIds = (enrollments as any[])?.map((e: any) => e.course_id) || [];
        const batchIds = (enrollments as any[])?.map((e: any) => e.batch_id).filter(Boolean) || [];

        // Phase 2: remaining sections + re-fetch available with exclusions
        const [[assignmentsWithStatus, quizzesWithStatus, liveClasses, recentMaterials], availableCourses] = await Promise.all([
            Promise.all([
                fetchAssignmentsWithStatus(courseIds, companyId, studentId),
                fetchQuizzesWithStatus(courseIds, companyId, studentId),
                fetchLiveClasses(courseIds, batchIds, companyId),
                fetchRecentMaterials(courseIds, companyId)
            ]),
            fetchAvailableCourses(companyId, courseIds)
        ]);

        const totalProgress = enrollments.reduce((acc: number, curr: any) => acc + (curr.completion_percentage || 0), 0);
        const averageProgress = enrollments.length > 0 ? totalProgress / enrollments.length : 0;

        const responseData = {
            student: {
                id: studentId,
                name: `${(student as any).first_name} ${(student as any).last_name}`,
                student_code: (student as any).student_code,
                email: (student as any).email,
            },
            stats: {
                total_courses: enrollments.length,
                active_assignments: (assignmentsWithStatus as any[])?.filter((a: any) => a.status === 'NOT_SUBMITTED').length || 0,
                pending_quizzes: (quizzesWithStatus as any[])?.length || 0,
                upcoming_classes: (liveClasses as any[])?.length || 0,
                average_progress: averageProgress
            },
            enrolled_courses: enrollments,
            available_courses: availableCourses || availRaw,
            pending_assignments: assignmentsWithStatus,
            upcoming_quizzes: quizzesWithStatus,
            upcoming_live_classes: liveClasses,
            active_attendance_sessions: activeSessions,
            recent_materials: recentMaterials
        };

        await dataCache.set(cacheKey, responseData, 30 * 1000);
        return successResponse(responseData, 'Student dashboard loaded');

    } catch (error: any) {
        return errorResponse(null, error.message || 'Failed to fetch dashboard', 500);
    }
}
