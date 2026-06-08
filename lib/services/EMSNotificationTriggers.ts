import { NotificationService } from './NotificationService';
import { ems, core, app_auth } from '@/lib/supabase';

export class EMSNotificationTriggers {
    /**
     * Triggered when a new live class is scheduled
     */
    static async onLiveClassScheduled(liveClassId: number, companyId: number) {
        try {
            // 1. Fetch class details with relations to get user_ids
            const { data: liveClass, error } = await ems.liveClasses()
                .select(`
                    id,
                    class_title,
                    scheduled_date,
                    start_time,
                    course_id,
                    batch_id,
                    tutor_id,
                    courses:course_id (course_name)
                `)
                .eq('id', liveClassId)
                .single();

            if (error || !liveClass) return;

            // 2. Notify the Tutor
            if (liveClass.tutor_id) {
                // Get tutor's user_id from core.employees
                const { data: tutor } = await core.employees()
                    .select('user_id')
                    .eq('id', liveClass.tutor_id)
                    .single();

                if (tutor?.user_id) {
                    await NotificationService.send({
                        userId: tutor.user_id,
                        companyId,
                        product: 'EMS',
                        module: 'live_classes',
                        title: '📅 New Class Assigned',
                        message: `You have been assigned to teach "${liveClass.class_title}" for ${(liveClass.courses as any)?.course_name} on ${liveClass.scheduled_date} at ${liveClass.start_time}.`,
                        type: 'INFO',
                        category: 'REMINDER',
                        priority: 'NORMAL',
                        actionUrl: '/ems/tutor/live-classes',
                        actionLabel: 'View Schedule',
                        referenceType: 'live_class',
                        referenceId: liveClassId
                    });
                }
            }

            // 3. Notify all Students in the batch
            if (liveClass.batch_id) {
                // Get all student user_ids in this batch via enrollments
                const { data: enrollments } = await ems.enrollments()
                    .select('student_id, students:student_id (user_id)')
                    .eq('batch_id', liveClass.batch_id)
                    .eq('enrollment_status', 'ACTIVE')
                    .is('deleted_at', null);

                const studentUserIds = enrollments
                    ?.map((e: any) => e.students?.user_id)
                    .filter(id => id !== null) || [];

                if (studentUserIds.length > 0) {
                    await NotificationService.notifyMany(studentUserIds, {
                        companyId,
                        product: 'EMS',
                        module: 'live_classes',
                        title: '🎓 New Live Class Scheduled',
                        message: `"${liveClass.class_title}" has been scheduled for your batch on ${liveClass.scheduled_date} at ${liveClass.start_time}.`,
                        type: 'INFO',
                        category: 'REMINDER',
                        priority: 'NORMAL',
                        actionUrl: '/ems/student/live-classes',
                        actionLabel: 'View Class',
                        referenceType: 'live_class',
                        referenceId: liveClassId
                    });
                }
            }
        } catch (err) {
            console.error('❌ [EMSNotificationTriggers] onLiveClassScheduled Error:', err);
        }
    }

    /**
     * Triggered when attendance session is completed
     */
    static async onAttendanceSubmitted(sessionId: number, companyId: number) {
        try {
            const { data: session } = await ems.attendanceSessions()
                .select(`
                    id,
                    courses:course_id (course_name),
                    batches:batch_id (batch_name)
                `)
                .eq('id', sessionId)
                .single();

            if (!session) return;

            // Notify Academic Managers of this company
            // 1. Get Academic Manager role ID
            const { data: role } = await app_auth.roles()
                .select('id')
                .eq('name', 'ACADEMIC_MANAGER')
                .single();

            if (role) {
                // 2. Get all users with this role in this company
                const { data: managers } = await app_auth.userRoles()
                    .select('user_id')
                    .eq('role_id', role.id)
                    .eq('company_id', companyId)
                    .eq('is_active', true);

                const managerUserIds = managers?.map(m => m.user_id) || [];

                if (managerUserIds.length > 0) {
                    await NotificationService.notifyMany(managerUserIds, {
                        companyId,
                        product: 'EMS',
                        module: 'attendance',
                        title: '📊 Attendance Submitted',
                        message: `Attendance for ${(session.courses as any)?.course_name} (${(session.batches as any)?.batch_name}) has been submitted and is ready for review.`,
                        type: 'SUCCESS',
                        category: 'INFO',
                        priority: 'NORMAL',
                        actionUrl: '/ems/academic-manager/attendance',
                        actionLabel: 'Review Attendance',
                        referenceType: 'attendance_session',
                        referenceId: sessionId
                    });
                }
            }
        } catch (err) {
            console.error('❌ [EMSNotificationTriggers] onAttendanceSubmitted Error:', err);
        }
    }

    /**
     * Triggered when class status changes (LIVE, COMPLETED)
     */
    static async onClassStatusChanged(liveClassId: number, status: string, companyId: number) {
        try {
            const { data: liveClass } = await ems.liveClasses()
                .select(`id, class_title, courses:course_id (course_name)`)
                .eq('id', liveClassId)
                .single();

            if (!liveClass) return;

            // Notify Academic Managers
            const { data: role } = await app_auth.roles().select('id').eq('name', 'ACADEMIC_MANAGER').single();
            if (role) {
                const { data: managers } = await app_auth.userRoles()
                    .select('user_id')
                    .eq('role_id', role.id)
                    .eq('company_id', companyId)
                    .eq('is_active', true);

                const managerUserIds = managers?.map(m => m.user_id) || [];

                if (managerUserIds.length > 0) {
                    const statusText = status === 'LIVE' ? 'is now LIVE! 🔴' : 'has been COMPLETED. ✅';
                    const msgType = status === 'LIVE' ? 'SUCCESS' : 'INFO';
                    const msgCategory = status === 'LIVE' ? 'ANNOUNCEMENT' : 'INFO';

                    await NotificationService.notifyMany(managerUserIds, {
                        companyId,
                        product: 'EMS',
                        module: 'live_classes',
                        title: `Class ${status === 'LIVE' ? 'Started' : 'Ended'}`,
                        message: `"${liveClass.class_title}" for ${(liveClass.courses as any)?.course_name} ${statusText}`,
                        type: msgType,
                        category: msgCategory,
                        priority: status === 'LIVE' ? 'HIGH' : 'NORMAL',
                        actionUrl: '/ems/academic-manager/live-classes',
                        actionLabel: 'Monitor Classes',
                        referenceType: 'live_class',
                        referenceId: liveClassId
                    });
                }
            }
        } catch (err) {
            console.error('❌ [EMSNotificationTriggers] onClassStatusChanged Error:', err);
        }
    }

    /**
     * Triggered when a new assignment is created
     */
    static async onAssignmentCreated(assignmentId: number, companyId: number) {
        try {
            console.log(`[Trigger] onAssignmentCreated for ID: ${assignmentId}`);
            // 1. Fetch assignment details
            const { data: assignment, error } = await ems.assignments()
                .select(`
                    id,
                    assignment_title,
                    course_id,
                    batch_id,
                    tutor_id,
                    courses:course_id (course_name)
                `)
                .eq('id', assignmentId)
                .single();

            if (error || !assignment) {
                console.error('[Trigger] Assignment not found:', error);
                return;
            }

            console.log(`[Trigger] Found Assignment: ${assignment.assignment_title}, TutorID: ${assignment.tutor_id}`);

            // 2. Notify the Tutor
            let tutorUserId: number | null = null;
            if (assignment.tutor_id) {
                const { data: tutor } = await core.employees()
                    .select('user_id')
                    .eq('id', assignment.tutor_id)
                    .single();
                tutorUserId = tutor?.user_id || null;
                console.log(`[Trigger] Resolved Tutor UserID: ${tutorUserId}`);
            }

            if (tutorUserId) {
                await NotificationService.send({
                    userId: tutorUserId,
                    companyId,
                    product: 'EMS',
                    module: 'assignments',
                    title: '📝 New Assignment Notification',
                    message: `You have been assigned to evaluate \"${assignment.assignment_title}\" for ${(assignment.courses as any)?.course_name || 'your course'}.`,
                    type: 'INFO',
                    category: 'INFO',
                    priority: 'NORMAL',
                    actionUrl: '/ems/tutor/assignments',
                    actionLabel: 'View Assignments',
                    referenceType: 'assignment',
                    referenceId: assignmentId
                });
            }

            // 3. Notify Students
            console.log(`[Trigger] Fetching students for Batch: ${assignment.batch_id} or Course: ${assignment.course_id}`);
            const { data: enrollments, error: enrollError } = await ems.enrollments()
                .select('student_id, students:student_id (user_id)')
                .eq(assignment.batch_id ? 'batch_id' : 'course_id', assignment.batch_id || assignment.course_id)
                .eq('enrollment_status', 'ACTIVE')
                .is('deleted_at', null);

            if (enrollError) {
                console.error('[Trigger] Enrollments error:', enrollError);
            }

            const studentUserIds = enrollments?.map((e: any) => e.students?.user_id).filter((id: any) => id !== null) || [];
            console.log(`[Trigger] Notifying ${studentUserIds.length} students`);

            if (studentUserIds.length > 0) {
                await NotificationService.notifyMany(studentUserIds, {
                    companyId,
                    product: 'EMS',
                    module: 'assignments',
                    title: '📚 New Assignment Published',
                    message: `A new assignment "${assignment.assignment_title}" has been published for ${(assignment.courses as any)?.course_name}.`,
                    type: 'INFO',
                    category: 'REMINDER',
                    priority: 'NORMAL',
                    actionUrl: '/ems/student/assignments',
                    actionLabel: 'View Assignment',
                    referenceType: 'assignment',
                    referenceId: assignmentId
                });
            }
            console.log(`✅ [EMSNotificationTriggers] onAssignmentCreated: Notifications sent to ${studentUserIds.length} students.`);
        } catch (err) {
            console.error('❌ [EMSNotificationTriggers] onAssignmentCreated Error:', err);
        }
    }
    /**
     * Triggered when a student submits an assignment
     */
    static async onAssignmentSubmitted(assignmentId: number, studentId: number, companyId: number) {
        try {
            console.log(`[Trigger] onAssignmentSubmitted for ID: ${assignmentId}, Student: ${studentId}`);

            // 1. Fetch details
            const { data: assignment } = await ems.assignments()
                .select(`
                    id, 
                    assignment_title, 
                    tutor_id,
                    courses:course_id (course_name)
                `)
                .eq('id', assignmentId)
                .single();

            const { data: student } = await ems.students()
                .select(`first_name, last_name, student_code`)
                .eq('id', studentId)
                .single();

            if (!assignment || !student) {
                console.warn('[Trigger] Assignment or Student not found for submission notification');
                return;
            }

            const studentName = `${student.first_name} ${student.last_name}`;
            const courseName = (assignment.courses as any)?.course_name || 'Course';

            // 2. Notify Academic Managers
            const { data: role } = await app_auth.roles().select('id').eq('name', 'ACADEMIC_MANAGER').single();
            if (role) {
                const { data: managers } = await app_auth.userRoles()
                    .select('user_id')
                    .eq('role_id', role.id)
                    .eq('company_id', companyId)
                    .eq('is_active', true);

                const managerUserIds = managers?.map(m => m.user_id) || [];

                if (managerUserIds.length > 0) {
                    await NotificationService.notifyMany(managerUserIds, {
                        companyId,
                        product: 'EMS',
                        module: 'assignments',
                        title: '📥 New Assignment Submission',
                        message: `${studentName} (${student.student_code}) has submitted "${assignment.assignment_title}" for ${courseName}.`,
                        type: 'SUCCESS',
                        category: 'INFO',
                        priority: 'NORMAL',
                        actionUrl: `/ems/academic-manager/assignments/${assignmentId}`,
                        actionLabel: 'Review Submission',
                        referenceType: 'assignment_submission',
                        referenceId: assignmentId
                    });
                }
            }

            // 3. Notify the Tutor
            if (assignment.tutor_id) {
                const { data: tutor } = await core.employees()
                    .select('user_id')
                    .eq('id', assignment.tutor_id)
                    .single();

                if (tutor?.user_id) {
                    await NotificationService.send({
                        userId: tutor.user_id,
                        companyId,
                        product: 'EMS',
                        module: 'assignments',
                        title: '📝 Submission for Evaluation',
                        message: `${studentName} has submitted "${assignment.assignment_title}". Ready for evaluation.`,
                        type: 'INFO',
                        category: 'INFO',
                        priority: 'NORMAL',
                        actionUrl: '/ems/tutor/assignments',
                        actionLabel: 'Evaluate',
                        referenceType: 'assignment_submission',
                        referenceId: assignmentId
                    });
                }
            }

            console.log(`✅ [EMSNotificationTriggers] onAssignmentSubmitted: Notifications sent for assignment ${assignmentId}`);
        } catch (err) {
            console.error('❌ [EMSNotificationTriggers] onAssignmentSubmitted Error:', err);
        }
    }
}
