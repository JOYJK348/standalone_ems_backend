import { ems } from '@/lib/supabase';
import { Assignment, AssignmentSubmission } from '@/types/database';

/**
 * Service for Assignment Management
 * Handles multi-tenant course assignments for both online and offline classes
 */
export class AssignmentService {

    /**
     * Get all assignments for a company
     * Can be filtered by course, batch, or tutor
     */
    static async getAllAssignments(companyId: number, courseIds?: number[], batchId?: number) {
        let query = ems.assignments()
            .select(`
                *,
                courses:course_id (
                    id,
                    course_name,
                    course_code
                ),
                batches:batch_id (
                    id,
                    batch_name,
                    batch_code
                ),
                submissions:assignment_submissions(count)
            `)
            .eq('company_id', companyId)
            .is('deleted_at', null)
            .order('created_at', { ascending: false });

        if (courseIds && courseIds.length > 0) {
            query = query.in('course_id', courseIds);
        }

        if (batchId) {
            query = query.or(`batch_id.eq.${batchId},batch_id.is.null`);
        }

        const { data, error } = await query;
        if (error) throw error;

        return data.map((item: any) => ({
            ...item,
            submissions_count: item.submissions?.[0]?.count || 0
        }));
    }

    /**
     * Create a new assignment
     */
    static async createAssignment(data: Partial<Assignment>) {
        const assignmentData = {
            ...data,
            approval_status: 'PENDING'
        };

        const { data: assignment, error } = await ems.assignments()
            .insert([assignmentData])
            .select()
            .single();

        if (error) throw error;
        return assignment;
    }

    /**
     * Get assignment by ID with statistics
     */
    static async getAssignmentDetails(assignmentId: number, companyId: number) {
        const { data: assignment, error } = await ems.assignments()
            .select(`
                *,
                courses:course_id (*),
                batches:batch_id (*),
                submissions:assignment_submissions(count)
            `)
            .eq('id', assignmentId)
            .eq('company_id', companyId)
            .single();

        if (error) throw error;
        return assignment;
    }

    /**
     * Update an assignment
     */
    static async updateAssignment(id: number, companyId: number, data: Partial<Assignment>) {
        const { data: assignment, error } = await ems.assignments()
            .update(data)
            .eq('id', id)
            .eq('company_id', companyId)
            .select()
            .single();

        if (error) throw error;
        return assignment;
    }

    /**
     * Delete an assignment (Soft delete)
     */
    static async deleteAssignment(id: number, companyId: number, userId: number) {
        const { error } = await ems.assignments()
            .update({
                deleted_at: new Date().toISOString(),
                deleted_by: userId
            })
            .eq('id', id)
            .eq('company_id', companyId);

        if (error) throw error;
        return true;
    }

    /**
     * Get assignment detail for a student (includes their submission)
     */
    static async getStudentAssignmentDetail(assignmentId: number, studentId: number, companyId: number) {
        const { data: assignment, error } = await ems.assignments()
            .select(`
                *,
                course:course_id (id, course_name, course_code),
                submissions:assignment_submissions (*)
            `)
            .eq('id', assignmentId)
            .eq('company_id', companyId)
            .single();

        if (error) throw error;

        const submission = assignment.submissions?.find((s: any) => s.student_id === studentId);

        // Remove submissions array to keep response clean
        delete (assignment as any).submissions;

        return {
            ...assignment,
            submission: submission || null
        };
    }

    /**
     * Submit an assignment (Student)
     */
    static async submitAssignment(submission: Partial<AssignmentSubmission>) {
        console.log('[AssignmentService] Processing submission for:', {
            assignment_id: submission.assignment_id,
            student_id: submission.student_id
        });

        // Check if submission exists
        const { data: existing, error: checkError } = await ems.assignmentSubmissions()
            .select('id')
            .eq('assignment_id', submission.assignment_id)
            .eq('student_id', submission.student_id)
            .maybeSingle();

        if (checkError) {
            console.error('[AssignmentService] Error checking existing submission:', checkError);
            throw checkError;
        }

        let data, error;

        if (existing) {
            console.log('[AssignmentService] Updating existing submission ID:', existing.id);
            // Update
            const result = await ems.assignmentSubmissions()
                .update(submission)
                .eq('id', existing.id)
                .select()
                .single();
            data = result.data;
            error = result.error;
        } else {
            console.log('[AssignmentService] Inserting new submission');
            // Insert
            const result = await ems.assignmentSubmissions()
                .insert([submission])
                .select()
                .single();
            data = result.data;
            error = result.error;
        }

        if (error) {
            console.error('[AssignmentService] DB Error during submit:', error);
            throw error;
        }
        return data;
    }

    /**
     * Grade an assignment (Tutor)
     */
    static async gradeSubmission(submissionId: number, companyId: number, gradingData: {
        marks_obtained: number,
        tutor_feedback?: string,
        graded_by: number,
        submission_status: string
    }) {
        const { data, error } = await ems.assignmentSubmissions()
            .update({
                ...gradingData,
                graded_at: new Date().toISOString()
            })
            .eq('id', submissionId)
            .eq('company_id', companyId)
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    /**
     * Get student's pending assignments
     */
    static async getStudentAssignments(studentId: number, companyId: number) {
        // 1. Get all active enrollments
        const { data: enrollments } = await ems.enrollments()
            .select('course_id, batch_id')
            .eq('student_id', studentId)
            .eq('enrollment_status', 'ACTIVE');

        if (!enrollments || enrollments.length === 0) return [];

        const courseIds = enrollments.map(e => e.course_id);
        const batchIds = enrollments.map(e => e.batch_id).filter(id => id !== null);

        // 2. Get assignments for these courses/batches
        let query = ems.assignments()
            .select(`
                *,
                courses:course_id (course_name),
                submissions:assignment_submissions (*)
            `)
            .eq('company_id', companyId)
            .in('course_id', courseIds)
            .is('deleted_at', null);

        // Filter submissions for this specific student in the join
        // Note: PostgREST doesn't support complex joins well here, so we'll fetch and filter

        const { data: assignments, error } = await query;
        if (error) throw error;

        // 3. Filter and Map status
        return assignments.map((assignment: any) => {
            const studentSumission = assignment.submissions?.find((s: any) => s.student_id === studentId);
            return {
                ...assignment,
                submission_status: studentSumission ? studentSumission.submission_status : 'PENDING',
                marks_obtained: studentSumission ? studentSumission.marks_obtained : null,
                submitted_at: studentSumission ? studentSumission.submitted_at : null
            };
        });
    }

    /**
     * Get all students for an assignment with their submission status
     */
    static async getAssignmentSubmissions(assignmentId: number, companyId: number) {
        if (!companyId) throw new Error('Company ID is required for accessing assignment submissions');

        console.log(`[AssessmentService] Fetching details for assignment ${assignmentId} in company ${companyId}`);

        // 1. Get assignment details
        const { data: assignment, error: assignmentError } = await ems.assignments()
            .select(`
                *,
                courses:course_id (course_name, course_code),
                batches:batch_id (batch_name)
            `)
            .eq('id', assignmentId)
            .eq('company_id', companyId)
            .single();

        if (assignmentError) throw assignmentError;

        // 2. Get all students enrolled in this course/batch
        let studentQuery = ems.enrollments()
            .select(`
                student:student_id (
                    id,
                    first_name,
                    last_name,
                    student_code,
                    email,
                    phone
                )
            `)
            .eq('course_id', assignment.course_id)
            .eq('enrollment_status', 'ACTIVE');

        if (assignment.batch_id) {
            studentQuery = studentQuery.eq('batch_id', assignment.batch_id);
        }

        const { data: enrollments, error: enrollmentError } = await studentQuery;
        if (enrollmentError) throw enrollmentError;

        // 3. Get all submissions for this assignment
        const { data: submissions, error: submissionError } = await ems.assignmentSubmissions()
            .select('*')
            .eq('assignment_id', assignmentId);

        if (submissionError) throw submissionError;

        const submissionsMap = new Map(submissions?.map((s: any) => [String(s.student_id), s]));

        // 4. Combine
        const studentList = enrollments
            ?.filter((e: any) => e.student) // Safety check: Ensure student exists
            .map((e: any) => {
                const student: any = e.student;
                const submission = submissionsMap.get(String(student.id));

                return {
                    ...student,
                    submission: submission || null,
                    status: submission ? (submission.submission_status || 'SUBMITTED') : 'NOT_SUBMITTED'
                };
            }) || [];

        return {
            assignment,
            students: studentList
        };
    }
}
