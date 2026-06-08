import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/errorHandler';
import { getUserIdFromToken } from '@/lib/jwt';
import { ems, app_auth } from '@/lib/supabase';
import { getUserTenantScope } from '@/middleware/tenantFilter';
import { dataCache } from '@/lib/cache/dataCache';
import { AttendanceService } from '@/lib/services/AttendanceService';
import { logDiagnostic } from '@/lib/diagnostic';
import { requireMenuAccessAppRouter } from '@/lib/menuAccessAppRouter';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    try {
        logDiagnostic('Starting GET request');
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse(null, 'Unauthorized', 401);

        logDiagnostic('User ID resolved', { userId });
        const menuAccess = await requireMenuAccessAppRouter(req, 'ems.dashboard.student');
        if (menuAccess instanceof Response) return menuAccess;

        const scope = await getUserTenantScope(userId);
        logDiagnostic('Tenant scope resolved', { scope });

        const { data: authUser } = await app_auth.users()
            .select(`
                id,
                email,
                first_name,
                last_name,
                user_roles (
                    roles (name)
                )
            `)
            .eq('id', userId)
            .maybeSingle();

        // Resolve student record - RESILIENT version
        let student;
        logDiagnostic('Resolving student record...');
        try {
            // 1. Try resolving by user_id
            const { data: directStudent, error: directError } = await ems.students()
                .select('id, company_id, first_name, last_name, email, student_code')
                .eq('user_id', userId as any)
                .is('deleted_at', null)
                .maybeSingle();

            student = directStudent;

            // 2. Fallback to Email if user_id mapping fails
            if (!student) {
                logDiagnostic('User ID mapping failed, trying email fallback...');
                if (authUser?.email) {
                    const { data: studentByEmail } = await ems.students()
                        .select('id, company_id, first_name, last_name, email, student_code')
                        .eq('email', authUser.email)
                        .is('deleted_at', null)
                        .maybeSingle();

                    if (studentByEmail) {
                        student = studentByEmail;
                        logDiagnostic('Student resolved via email', { studentId: student.id });
                    }
                }
            }
        } catch (resError: any) {
            logDiagnostic('Resilience logic error', { message: resError.message });
        }

        if (!student) {
            logDiagnostic('Student record NOT found');
            const hasStudentRole = ((authUser as any)?.user_roles || [])
                .some((row: any) => row.roles?.name === 'STUDENT');

            if (!hasStudentRole) {
                return errorResponse(null, 'Student profile not found. Please contact your administrator.', 404);
            }

            const fallbackName = [authUser?.first_name, authUser?.last_name].filter(Boolean).join(' ') || authUser?.email || 'Student';

            return successResponse({
                student: {
                    id: userId,
                    name: fallbackName,
                    student_code: '',
                    email: authUser?.email || '',
                    profile_linked: false
                },
                stats: {
                    total_courses: 0,
                    active_assignments: 0,
                    pending_quizzes: 0,
                    upcoming_classes: 0,
                    average_progress: 0
                },
                enrolled_courses: [],
                available_courses: [],
                pending_assignments: [],
                upcoming_quizzes: [],
                upcoming_live_classes: [],
                active_attendance_sessions: [],
                recent_materials: []
            }, 'Student dashboard loaded without linked student profile');
        }

        const studentId = (student as any).id;
        const companyId = (student as any).company_id;
        logDiagnostic('Target Student Identified', { studentId, companyId });

        // 1. Get Enrolled Courses with Progress
        let enrollments: any[] = [];
        logDiagnostic('Fetching enrollments...');
        try {
            const { data: enrollmentData, error: enrollmentError } = await ems.enrollments()
                .select(`
                    id,
                    course_id,
                    batch_id,
                    enrollment_date,
                    enrollment_status,
                    completion_percentage,
                    total_lessons,
                    lessons_completed,
                    course:courses (
                        id,
                        course_code,
                        course_name,
                        thumbnail_url,
                        course_level
                    ),
                    batch:batches (
                        id,
                        batch_name
                    )
                `)
                .eq('student_id', studentId)
                .eq('company_id', companyId)
                .in('enrollment_status', ['ACTIVE', 'PENDING', 'ENROLLED'])
                .is('deleted_at', null) as any;

            if (enrollmentError) throw enrollmentError;
            enrollments = enrollmentData || [];
            logDiagnostic('Enrollments fetched', { count: enrollments.length });
        } catch (e: any) {
            logDiagnostic('Enrollment fetch error', { message: e.message });
            const { data: minEnrollments } = await ems.enrollments()
                .select('id, course_id, batch_id')
                .eq('student_id', studentId)
                .eq('company_id', companyId)
                .is('deleted_at', null) as any;
            enrollments = minEnrollments || [];
        }

        // 2. Get Pending Assignments
        let assignments: any[] = [];
        logDiagnostic('Fetching assignments...');
        try {
            const courseIds = (enrollments as any[])?.map((e: any) => e.course_id) || [];
            if (courseIds.length > 0) {
                const { data: assignmentData, error: assignmentError } = await ems.assignments()
                    .select(`
                        id,
                        assignment_title,
                        deadline,
                        course:courses (id, course_name)
                    `)
                    .in('course_id', courseIds)
                    .eq('company_id', companyId)
                    .eq('is_active', true)
                    .is('deleted_at', null)
                    .limit(10) as any;

                if (assignmentError) throw assignmentError;
                assignments = assignmentData || [];
                logDiagnostic('Assignments fetched', { count: assignments.length });
            }
        } catch (e: any) {
            logDiagnostic('Assignments fetch error', { message: e.message });
        }

        // 3. Assignment Submissions
        let assignmentsWithStatus: any[] = [];
        logDiagnostic('Fetching submissions...');
        try {
            const assignmentIds = (assignments as any[])?.map(a => a.id) || [];
            if (assignmentIds.length > 0) {
                const { data: allSubmissions } = await ems.assignmentSubmissions()
                    .select('id, assignment_id, submission_status')
                    .in('assignment_id', assignmentIds)
                    .eq('student_id', studentId) as any;

                const submissionMap = new Map((allSubmissions || []).map((s: any) => [s.assignment_id, s]));
                assignmentsWithStatus = (assignments as any[])?.map(assignment => ({
                    ...assignment,
                    status: (submissionMap.get(assignment.id) as any)?.submission_status || 'NOT_SUBMITTED'
                })) || [];
                logDiagnostic('Submissions processed');
            }
        } catch (e: any) {
            logDiagnostic('Submissions fetch error', { message: e.message });
        }

        // 4. Quizzes
        let quizzesWithStatus: any[] = [];
        logDiagnostic('Fetching quizzes...');
        try {
            const enrolledCourseIds = (enrollments as any[])?.map((e: any) => e.course_id) || [];
            if (enrolledCourseIds.length > 0) {
                const { data: rawQuizzes, error: quizError } = await ems.quizzes()
                    .select('id, quiz_title, max_attempts')
                    .in('course_id', enrolledCourseIds)
                    .eq('company_id', companyId)
                    .eq('is_active', true)
                    .is('deleted_at', null) as any;

                if (quizError) throw quizError;

                const quizIds = (rawQuizzes || []).map((q: any) => q.id);
                if (quizIds.length > 0) {
                    const { data: allAttempts } = await ems.quizAttempts()
                        .select('quiz_id, status')
                        .in('quiz_id', quizIds)
                        .eq('student_id', studentId) as any;

                    const attemptCounts = new Map();
                    (allAttempts || []).forEach((a: any) => {
                        attemptCounts.set(a.quiz_id, (attemptCounts.get(a.quiz_id) || 0) + 1);
                    });

                    quizzesWithStatus = (rawQuizzes || []).map((q: any) => ({
                        ...q,
                        attempts_taken: attemptCounts.get(q.id) || 0
                    }));
                }
                logDiagnostic('Quizzes processed', { count: quizzesWithStatus.length });
            }
        } catch (e: any) {
            logDiagnostic('Quizzes fetch error', { message: e.message });
        }

        // 5. Live Classes
        let liveClasses: any[] = [];
        logDiagnostic('Fetching live classes...');
        try {
            const courseIds = (enrollments as any[])?.map((e: any) => e.course_id) || [];
            const batchIds = (enrollments as any[])?.map((e: any) => e.batch_id).filter(Boolean) || [];

            if (courseIds.length > 0) {
                // Construct a robust query that finds classes by Course
                let query = ems.liveClasses()
                    .select(`
                        id, 
                        class_title, 
                        scheduled_date, 
                        start_time, 
                        batch_id,
                        course_id,
                        meeting_link,
                        meeting_platform,
                        class_status,
                        course:courses(id, course_name),
                        batch:batches(id, batch_name)
                    `)
                    .eq('company_id', companyId)
                    .in('course_id', courseIds)
                    .gte('scheduled_date', new Date().toISOString().split('T')[0])
                    .is('deleted_at', null);

                // Filter by batch logic:
                // If the class has a batch_id, student must be in that batch.
                // If it's null, it's for everyone in the course.
                if (batchIds.length > 0) {
                    query = query.or(`batch_id.in.(${batchIds.join(',')}),batch_id.is.null`);
                } else {
                    query = query.is('batch_id', null);
                }

                const { data: rawLiveClasses, error: liveError } = await query
                    .order('scheduled_date', { ascending: true })
                    .order('start_time', { ascending: true }) as any;

                if (liveError) throw liveError;

                liveClasses = (rawLiveClasses || []).map(lc => ({
                    ...lc,
                    status: lc.class_status || 'SCHEDULED', // Map for frontend convenience
                    external_link: lc.meeting_link // Map for frontend convenience
                })).slice(0, 5);

                logDiagnostic('Live classes fetched and mapped', { count: liveClasses.length });
            }
        } catch (e: any) {
            logDiagnostic('Live classes fetch error', { message: e.message });
        }

        // 6. Attendance
        let activeSessions: any[] = [];
        logDiagnostic('Fetching attendance...');
        try {
            activeSessions = await AttendanceService.getStudentActiveSessionsWithStatus(companyId, studentId);
            logDiagnostic('Attendance sessions fetched', { count: activeSessions.length });
        } catch (e: any) {
            logDiagnostic('Attendance fetch error', { message: e.message });
        }

        // 7. Recent Materials
        let recentMaterials: any[] = [];
        logDiagnostic('Fetching recent materials...');
        try {
            const courseIds = (enrollments as any[])?.map((e: any) => e.course_id) || [];
            if (courseIds.length > 0) {
                const { data: materialsData } = await ems.courseMaterials()
                    .select(`
                        id,
                        material_name,
                        material_type,
                        file_url,
                        created_at,
                        course:courses(id, course_name)
                    `)
                    .in('course_id', courseIds)
                    .eq('company_id', companyId)
                    .eq('is_active', true)
                    .or('target_audience.eq.STUDENTS,target_audience.eq.BOTH,target_audience.is.null')
                    .order('created_at', { ascending: false })
                    .limit(6) as any;
                recentMaterials = materialsData || [];
                logDiagnostic('Recent materials fetched', { count: recentMaterials.length });
            }
        } catch (e: any) {
            logDiagnostic('Materials fetch error', { message: e.message });
        }

        // 8. Available Courses (Not Enrolled)
        let availableCourses: any[] = [];
        logDiagnostic('Fetching available courses...');
        try {
            const enrolledCourseIds = (enrollments as any[])?.map((e: any) => e.course_id) || [];
            let query = ems.courses()
                .select('id, course_name, course_code, course_description, thumbnail_url, total_lessons, course_level, duration_hours, course_category')
                .eq('company_id', companyId)
                .eq('is_published', true)
                .is('deleted_at', null);

            if (enrolledCourseIds.length > 0) {
                query = query.not('id', 'in', `(${enrolledCourseIds.join(',')})`);
            }

            const { data: availableData } = await query.limit(10) as any;
            availableCourses = availableData || [];
            logDiagnostic('Available courses fetched', { count: availableCourses.length });
        } catch (e: any) {
            logDiagnostic('Available courses fetch error', { message: e.message });
        }

        // Calculate average progress
        const totalProgress = enrollments.reduce((acc: number, curr: any) => acc + (curr.completion_percentage || 0), 0);
        const averageProgress = enrollments.length > 0 ? totalProgress / enrollments.length : 0;

        const stats = {
            total_courses: enrollments.length,
            active_assignments: assignmentsWithStatus.filter(a => a.status === 'NOT_SUBMITTED').length,
            pending_quizzes: quizzesWithStatus.length,
            upcoming_classes: liveClasses.length,
            average_progress: averageProgress
        };

        const responseData = {
            student: {
                id: studentId,
                name: `${(student as any).first_name} ${(student as any).last_name}`,
                student_code: (student as any).student_code
            },
            stats,
            enrolled_courses: enrollments,
            available_courses: availableCourses,
            pending_assignments: assignmentsWithStatus,
            upcoming_quizzes: quizzesWithStatus,
            upcoming_live_classes: liveClasses,
            active_attendance_sessions: activeSessions,
            recent_materials: recentMaterials
        };

        logDiagnostic('Request complete, sending successResponse');
        return successResponse(responseData, 'Student dashboard loaded');

    } catch (error: any) {
        logDiagnostic('FATAL API ERROR', {
            message: error.message,
            stack: error.stack
        });
        return errorResponse(null, error.message || 'Failed to fetch dashboard', 500);
    }
}
