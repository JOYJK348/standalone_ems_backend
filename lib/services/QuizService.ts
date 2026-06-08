import { ems, core } from '@/lib/supabase';

export class QuizService {
    static async getAllQuizzes(companyId: number, courseIds?: number[], page = 1, limit = 20) {
        let query = ems.quizzes()
            .select(`
                id, quiz_title, quiz_description, quiz_type, total_marks, passing_marks, duration_minutes, max_attempts, is_active, course_id, created_at, status,
                courses:course_id (
                    id, 
                    course_name, 
                    course_code,
                    tutor_id
                ),
                quiz_assignments:quiz_assignments!quiz_id (
                    id,
                    batch_id,
                    student_id,
                    batches:batch_id (id, batch_name),
                    students:student_id (id, first_name, last_name)
                ),
                quiz_questions:quiz_questions!quiz_id (id)
            `)
            .eq('company_id', companyId)
            .is('deleted_at', null);

        if (courseIds && courseIds.length > 0) {
            query = query.in('course_id', courseIds);
        }

        const { data, error } = await query.order('created_at', { ascending: false });

        if (error) throw error;
        if (!data || data.length === 0) return [];

        const courseIdsToFetch = [...new Set(data.map(q => q.course_id))];

        // 1. Fetch Tutors and Enrollments in parallel for efficiency
        const [tutorsResponse, enrollmentsResponse] = await Promise.all([
            ems.courseTutors()
                .select('course_id, tutor_id')
                .in('course_id', courseIdsToFetch)
                .is('deleted_at', null),
            ems.enrollments()
                .select(`
                    id, 
                    course_id, 
                    student_id,
                    students:student_id (first_name, last_name)
                `)
                .in('course_id', courseIdsToFetch)
                .is('deleted_at', null)
        ]);

        const tutorsList = tutorsResponse.data || [];
        const allEnrollments = enrollmentsResponse.data || [];

        // 2. Fetch employee names for all tutors
        let employees: any[] = [];
        const allTutorIds = [...new Set([
            ...tutorsList.map(t => t.tutor_id),
            ...data.map(q => q.courses?.tutor_id).filter(Boolean) // Include primary tutors
        ])];

        if (allTutorIds.length > 0) {
            const { data: empData } = await core.employees()
                .select('id, first_name, last_name')
                .in('id', allTutorIds);
            employees = empData || [];
        }

        // 3. Map everything back to quizzes
        const enrichedData = data.map(quiz => {
            // Get tutors from junction table
            let courseTutors = tutorsList
                .filter(t => t.course_id === quiz.course_id)
                .map(t => {
                    const emp = employees.find(e => e.id === t.tutor_id);
                    return {
                        tutor_id: t.tutor_id,
                        employees: emp ? { first_name: emp.first_name, last_name: emp.last_name } : null
                    };
                });

            // Fallback: If no tutors in junction table, check the course's primary tutor_id
            if (courseTutors.length === 0 && quiz.courses?.tutor_id) {
                const emp = employees.find(e => e.id === quiz.courses.tutor_id);
                courseTutors = [{
                    tutor_id: quiz.courses.tutor_id,
                    employees: emp ? { first_name: emp.first_name, last_name: emp.last_name } : null
                }];
            }

            const enrollments = allEnrollments.filter(e => e.course_id === quiz.course_id);

            return {
                ...quiz,
                courses: {
                    ...quiz.courses,
                    tutors: courseTutors,
                    enrollments
                }
            };
        });

        return enrichedData;
    }

    static async getQuizById(id: number, companyId: number) {
        const { data, error } = await ems.quizzes()
            .select(`
                *,
                course:course_id (*),
                quiz_questions (*),
                quiz_assignments (*)
            `)
            .eq('id', id)
            .eq('company_id', companyId)
            .is('deleted_at', null)
            .single();

        if (error) throw error;
        return data;
    }

    static async createQuiz(data: any) {
        const { assignments, ...quizData } = data;

        // Set default approval status
        quizData.approval_status = 'PENDING';

        const { data: result, error } = await ems.quizzes()
            .insert(quizData)
            .select()
            .single();

        if (error) throw error;

        // If assignments are provided, create them
        if (assignments && Array.isArray(assignments) && assignments.length > 0) {
            const assignmentRecords = assignments.map((a: any) => ({
                ...a,
                quiz_id: result.id,
                company_id: result.company_id
            }));

            await ems.quizAssignments().insert(assignmentRecords);
        }

        return result;
    }

    static async assignQuiz(data: any) {
        const { data: result, error } = await ems.quizAssignments()
            .insert(data)
            .select()
            .single();

        if (error) throw error;
        return result;
    }

    static async updateQuiz(id: number, companyId: number, data: any) {
        const { assignments, ...quizData } = data;

        const { data: result, error } = await ems.quizzes()
            .update(quizData)
            .eq('id', id)
            .eq('company_id', companyId)
            .is('deleted_at', null)
            .select()
            .single();

        if (error) throw error;

        // If assignments are provided, replace existing ones
        if (assignments && Array.isArray(assignments)) {
            // Delete old assignments
            await ems.quizAssignments()
                .delete()
                .eq('quiz_id', id);

            // Insert new assignments if any
            if (assignments.length > 0) {
                const assignmentRecords = assignments.map((a: any) => ({
                    ...a,
                    quiz_id: id,
                    company_id: result.company_id
                }));
                await ems.quizAssignments().insert(assignmentRecords);
            }
        }

        return result;
    }

    static async deleteQuiz(id: number, companyId: number, deletedBy: number) {
        const { data, error } = await ems.quizzes()
            .update({
                deleted_at: new Date().toISOString(),
                deleted_by: deletedBy
            } as any)
            .eq('id', id)
            .eq('company_id', companyId)
            .is('deleted_at', null)
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    static async addQuestion(questionData: any) {
        const { data, error } = await ems.quizQuestions()
            .insert(questionData)
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    static async getQuestions(quizId: number) {
        const { data, error } = await ems.quizQuestions()
            .select(`
                *,
                quiz_options (
                    id,
                    option_text,
                    option_order,
                    is_correct
                )
            `)
            .eq('quiz_id', quizId)
            .order('question_order', { ascending: true });

        if (error) throw error;
        return data;
    }

    static async submitQuizAttempt(attemptData: any) {
        const { data, error } = await ems.quizAttempts()
            .insert(attemptData)
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    static async getStudentAttempts(quizId: number, studentId: number) {
        const { data, error } = await ems.quizAttempts()
            .select('*')
            .eq('quiz_id', quizId)
            .eq('student_id', studentId)
            .order('attempt_number', { ascending: false });

        if (error) throw error;
        return data;
    }

    static async getQuizAttempts(quizId: number, companyId: number, studentIds?: number[]) {
        let query = ems.quizAttempts()
            .select(`
                *,
                students:student_id (id, first_name, last_name, student_code, email)
            `)
            .eq('quiz_id', quizId)
            .eq('company_id', companyId);

        if (studentIds && studentIds.length > 0) {
            query = query.in('student_id', studentIds);
        }

        const { data, error } = await query.order('completed_at', { ascending: false });

        if (error) throw error;
        return data;
    }

    static async autoGradeAttempt(attemptId: number) {
        console.log(`[QuizService] autoGradeAttempt starting for ID: ${attemptId}`);
        // 1. Get attempt details
        const { data: attempt, error: attemptError } = await ems.quizAttempts()
            .select('*')
            .eq('id', attemptId)
            .single();

        if (attemptError || !attempt) {
            console.error('[QuizService] Attempt not found:', attemptError);
            throw new Error('Attempt not found');
        }

        // 2. Get quiz questions and options
        const { data: questions, error: questionsError } = await ems.quizQuestions()
            .select('*, quiz_options (*)')
            .eq('quiz_id', attempt.quiz_id);

        if (questionsError) {
            console.error('[QuizService] Questions fetch error:', questionsError);
            throw questionsError;
        }

        // Auto-grade logic
        let totalMarks = 0;
        let obtainedMarks = 0;
        let correctCount = 0;
        let wrongCount = 0;

        // 3. Get student responses from separate table
        const { data: responses, error: responseError } = await (ems as any).supabase
            .schema('ems')
            .from('quiz_responses')
            .select('*')
            .eq('attempt_id', attemptId);

        if (responseError) {
            console.error('[QuizService] Response fetch error:', responseError);
            throw responseError;
        }

        const studentResponses: Record<number, string> = {};
        (responses || []).forEach((r: any) => {
            studentResponses[r.question_id] = r.text_response;
        });

        const questionsList = questions || [];
        console.log(`[QuizService] Grading ${questionsList.length} questions. Responses found: ${responses?.length}`);

        questionsList.forEach((q: any) => {
            const marks = q.marks || 1;
            totalMarks += marks;

            const studentAnswerText = studentResponses[q.id];
            const correctOption = (q.quiz_options || []).find((opt: any) => opt.is_correct);

            if (studentAnswerText && correctOption && studentAnswerText === correctOption.option_text) {
                obtainedMarks += marks;
                correctCount++;
            } else if (studentAnswerText) {
                wrongCount++;
            }
        });

        const unanswered = questionsList.length - (correctCount + wrongCount);

        // 3. Update attempt with marks
        const { data, error } = await ems.quizAttempts()
            .update({
                marks_obtained: obtainedMarks,
                correct_answers: correctCount,
                wrong_answers: wrongCount,
                unanswered: unanswered,
                total_questions: questionsList.length,
                status: 'COMPLETED'
            } as any)
            .eq('id', attemptId)
            .select()
            .single();

        if (error) {
            console.error('[QuizService] Final grade update error:', error);
            throw error;
        }
        return data;
    }
}
