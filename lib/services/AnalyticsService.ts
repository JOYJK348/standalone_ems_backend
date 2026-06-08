import { ems } from '@/lib/supabase';
import { Database } from '@/types/database';

/**
 * Service for EMS Analytics & Reporting
 * Optimized for dashboard visualizations
 */
export class AnalyticsService {
    static async getCoursePerformance(courseId: number, companyId: number) {
        // Average completion percentage
        const { data: enrollments, error: enrollError } = await ems.enrollments()
            .select('completion_percentage, student_id')
            .eq('course_id', courseId)
            .eq('company_id', companyId);

        if (enrollError) throw enrollError;

        const avgCompletion = enrollments.length > 0
            ? enrollments.reduce((sum, e) => sum + (e.completion_percentage || 0), 0) / enrollments.length
            : 0;

        // Average quiz scores
        const { data: quizAttempts, error: quizError } = await ems.quizAttempts()
            .select('score_percentage')
            .eq('course_id', courseId)
            .eq('company_id', companyId);

        if (quizError) throw quizError;

        const avgQuizScore = quizAttempts.length > 0
            ? quizAttempts.reduce((sum, a) => sum + (a.score_percentage || 0), 0) / quizAttempts.length
            : 0;

        return {
            total_students: enrollments.length,
            average_completion_percentage: Math.round(avgCompletion),
            average_quiz_score: Math.round(avgQuizScore),
            completion_trend: [
                { stage: 'Not Started', count: enrollments.filter(e => (e.completion_percentage || 0) === 0).length },
                { stage: 'In Progress', count: enrollments.filter(e => (e.completion_percentage || 0) > 0 && (e.completion_percentage || 0) < 100).length },
                { stage: 'Completed', count: enrollments.filter(e => (e.completion_percentage || 0) === 100).length }
            ]
        };
    }

    static async getCompanyOverview(companyId: number) {
        // Get counts
        const [students, courses, batches, activeEnrollments] = await Promise.all([
            ems.students().select('id', { count: 'exact', head: true }).eq('company_id', companyId).is('deleted_at', null),
            ems.courses().select('id', { count: 'exact', head: true }).eq('company_id', companyId).is('deleted_at', null),
            ems.batches().select('id', { count: 'exact', head: true }).eq('company_id', companyId).is('deleted_at', null),
            ems.enrollments().select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('enrollment_status', 'ACTIVE')
        ]);

        return {
            total_students: students.count || 0,
            total_courses: courses.count || 0,
            total_batches: batches.count || 0,
            active_enrollments: activeEnrollments.count || 0
        };
    }

    static async getStudentGrowth(companyId: number) {
        // Monthly registration trend
        const { data, error } = await (ems.supabase as any)
            .rpc('get_student_growth_stats', { p_company_id: companyId });

        if (error) {
            // Fallback to simple query if RPC doesn't exist
            const { data: list } = await ems.students()
                .select('created_at')
                .eq('company_id', companyId)
                .order('created_at', { ascending: true });

            // Basic grouping by month in JS
            const trend: Record<string, number> = {};
            list?.forEach(s => {
                const month = new Date(s.created_at).toLocaleString('default', { month: 'short' });
                trend[month] = (trend[month] || 0) + 1;
            });

            return Object.entries(trend).map(([month, count]) => ({ month, count }));
        }

        return data;
    }
}
