import { ems } from '@/lib/supabase';
import { Quiz, Assignment } from '@/types/database';

/**
 * Service for Assessment Management (Quizzes & Assignments)
 * High-performance implementation with caching support
 */
export class AssessmentService {
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 1. QUIZ OPERATIONS
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    static async getQuizzes(
        companyId: number,
        courseId?: number,
        emsProfile?: { profileType: 'tutor' | 'student' | 'manager' | null; profileId: number | null }
    ) {
        let query = ems.quizzes()
            .select(`
                *,
                courses:course_id (
                    course_name,
                    course_code
                )
            `)
            .eq('company_id', companyId)
            .is('deleted_at', null);

        if (courseId) {
            query = query.eq('course_id', courseId);
        }

        // Role-based filtering for tutors
        if (emsProfile?.profileType === 'tutor' && emsProfile.profileId) {
            // Get tutor's course IDs (Multi-Tutor support)
            const { data: junctionMappings } = await ems.courseTutors()
                .select('course_id')
                .eq('tutor_id', emsProfile.profileId)
                .is('deleted_at', null);

            const { data: legacyCourses } = await ems.courses()
                .select('id')
                .eq('tutor_id', emsProfile.profileId)
                .is('deleted_at', null);

            const tutorCourseIds = [
                ...(junctionMappings?.map((m: any) => m.course_id) || []),
                ...(legacyCourses?.map((c: any) => c.id) || [])
            ];

            const uniqueCourseIds = [...new Set(tutorCourseIds)];

            if (uniqueCourseIds.length > 0) {
                query = query.in('course_id', uniqueCourseIds);
            } else {
                return []; // Tutor has no courses
            }
        }

        const { data, error } = await query.order('created_at', { ascending: false });

        if (error) throw error;
        return data as any[];
    }

    static async getQuizzesByCourse(courseId: number, companyId: number) {
        return this.getQuizzes(companyId, courseId);
    }

    static async createQuiz(quizData: Partial<Quiz>) {
        const { data, error } = await ems.quizzes()
            .insert(quizData)
            .select()
            .single();

        if (error) throw error;
        return data as Quiz;
    }

    static async getQuizWithQuestions(quizId: number) {
        // Optimized: Single query with joins
        const { data, error } = await ems.quizzes()
            .select(`
                *,
                quiz_questions (
                    *,
                    quiz_options (*)
                )
            `)
            .eq('id', quizId)
            .single();

        if (error) throw error;
        return data;
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 2. ASSIGNMENT OPERATIONS
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    static async getAssignments(
        companyId: number,
        courseId?: number,
        emsProfile?: { profileType: 'tutor' | 'student' | 'manager' | null; profileId: number | null }
    ) {
        let query = ems.assignments()
            .select(`
                *,
                courses:course_id (
                    course_name,
                    course_code
                )
            `)
            .eq('company_id', companyId)
            .is('deleted_at', null);

        if (courseId) {
            query = query.eq('course_id', courseId);
        }

        // Role-based filtering for tutors
        if (emsProfile?.profileType === 'tutor' && emsProfile.profileId) {
            // Get tutor's course IDs (Multi-Tutor support)
            const { data: junctionMappings } = await ems.courseTutors()
                .select('course_id')
                .eq('tutor_id', emsProfile.profileId)
                .is('deleted_at', null);

            const { data: legacyCourses } = await ems.courses()
                .select('id')
                .eq('tutor_id', emsProfile.profileId)
                .is('deleted_at', null);

            const tutorCourseIds = [
                ...(junctionMappings?.map((m: any) => m.course_id) || []),
                ...(legacyCourses?.map((c: any) => c.id) || [])
            ];

            const uniqueCourseIds = [...new Set(tutorCourseIds)];

            if (uniqueCourseIds.length > 0) {
                query = query.in('course_id', uniqueCourseIds);
            } else {
                return []; // Tutor has no courses
            }
        }

        const { data, error } = await query.order('created_at', { ascending: false });

        if (error) throw error;
        return data as any[];
    }

    static async getAssignmentsByCourse(courseId: number, companyId: number) {
        return this.getAssignments(companyId, courseId);
    }

    static async createAssignment(assignmentData: Partial<Assignment>) {
        const { data, error } = await ems.assignments()
            .insert(assignmentData)
            .select()
            .single();

        if (error) throw error;
        return data as Assignment;
    }

    static async getPendingAssignments(tutorId: number, companyId: number) {
        // 1. Get IDs from new course_tutors table
        const { data: junctionMappings } = await ems.courseTutors()
            .select('course_id')
            .eq('tutor_id', tutorId)
            .is('deleted_at', null);

        // 2. Get IDs from legacy courses table
        const { data: legacyCourses } = await ems.courses()
            .select('id')
            .eq('tutor_id', tutorId)
            .eq('company_id', companyId)
            .is('deleted_at', null);

        const assignedCourseIds = [
            ...(junctionMappings?.map((m: any) => m.course_id) || []),
            ...(legacyCourses?.map((c: any) => c.id) || [])
        ];

        const uniqueCourseIds = [...new Set(assignedCourseIds)];

        if (uniqueCourseIds.length === 0) return [];

        // Optimized query for tutor dashboard
        const { data, error } = await ems.assignments()
            .select(`
                id,
                assignment_title,
                deadline,
                assignment_submissions!inner (
                    id,
                    submission_status,
                    submitted_at,
                    students:student_id (
                        id,
                        first_name,
                        last_name,
                        student_code
                    )
                )
            `)
            .in('course_id', uniqueCourseIds)
            .eq('company_id', companyId)
            .eq('assignment_submissions.submission_status', 'SUBMITTED')
            .is('deleted_at', null);

        if (error) throw error;
        return data;
    }

    static async getTutorSubmissions(tutorId: number, companyId: number, status?: string) {
        let query = ems.supabase
            .from('assignment_submissions')
            .select(`
                *,
                students:student_id (
                    first_name,
                    last_name,
                    student_code
                ),
                assignments:assignment_id (
                    assignment_title,
                    course_id,
                    courses:course_id (
                        course_name,
                        tutor_id
                    )
                )
            `)
            .eq('company_id', companyId);

        if (status) {
            query = query.eq('submission_status', status);
        }

        const { data, error } = await query.order('submitted_at', { ascending: false });

        if (error) throw error;

        // Filter by assigned courses (Multi-Tutor support)
        const { data: junctionMappings } = await ems.courseTutors()
            .select('course_id')
            .eq('tutor_id', tutorId)
            .is('deleted_at', null);

        const { data: legacyCourses } = await ems.courses()
            .select('id')
            .eq('tutor_id', tutorId)
            .eq('company_id', companyId)
            .is('deleted_at', null);

        const assignedCourseIds = new Set([
            ...(junctionMappings?.map((m: any) => m.course_id) || []),
            ...(legacyCourses?.map((c: any) => c.id) || [])
        ]);

        const filteredData = data?.filter((s: any) =>
            assignedCourseIds.has(s.assignments?.course_id)
        );

        return filteredData || [];
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 3. GRADING OPERATIONS (OPTIMIZED FOR BULK)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    static async gradeSubmission(
        submissionId: number,
        marks: number,
        feedback: string,
        gradedBy: number
    ) {
        const { data, error } = await ((ems.supabase as any)
            .from('assignment_submissions')
            .update({
                marks_obtained: marks,
                tutor_feedback: feedback,
                graded_by: gradedBy,
                graded_at: new Date().toISOString(),
                submission_status: 'GRADED',
            }) as any)
            .eq('id', submissionId)
            .select()
            .single();

        if (error) throw error;
        return data;
    }
}
