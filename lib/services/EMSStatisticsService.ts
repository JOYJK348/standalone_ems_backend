import { ems } from '@/lib/supabase';
import { fromSchema } from '@/lib/supabase'
import { SCHEMAS } from '@/config/constants'

/**
 * Service for EMS Dashboard Statistics
 * Provides real-time metrics for Academic Manager dashboard
 */
export class EMSStatisticsService {
    /**
     * Get comprehensive dashboard statistics for a company
     * @param companyId - Company ID for tenant isolation
     */
    static async getDashboardStats(companyId: number) {
        try {
            const { ems, core } = require('@/lib/supabase');

            // Parallel queries for better performance
            const [
                coursesResult,
                publishedCoursesResult,
                batchesResult,
                studentsResult,
                tutorsResult,
                enrollmentsResult,
                activeStudentsResult,
                totalRevenueResult,
                pendingInvoicesResult,
                paidInvoicesResult,
                overdueInvoicesResult,
                totalExpensesResult,
                feePaymentsResult
            ] = await Promise.all([
                // Total Courses
                ems.courses()
                    .select('id', { count: 'exact', head: true })
                    .eq('company_id', companyId)
                    .is('deleted_at', null),

                // Published Courses
                ems.courses()
                    .select('id', { count: 'exact', head: true })
                    .eq('company_id', companyId)
                    .eq('is_published', true)
                    .is('deleted_at', null),

                // Total Batches
                ems.batches()
                    .select('id', { count: 'exact', head: true })
                    .eq('company_id', companyId)
                    .is('deleted_at', null),

                // Total Students
                ems.students()
                    .select('id', { count: 'exact', head: true })
                    .eq('company_id', companyId)
                    .is('deleted_at', null),

                // Total Tutors (from all employees/staff)
                core.employees()
                    .select('id', { count: 'exact', head: true })
                    .eq('company_id', companyId)
                    .is('deleted_at', null),

                // Total Enrollments
                ems.enrollments()
                    .select('id', { count: 'exact', head: true })
                    .eq('company_id', companyId)
                    .is('deleted_at', null),

                // Active Students (with at least one active enrollment)
                ems.enrollments()
                    .select('student_id')
                    .eq('company_id', companyId)
                    .eq('is_active', true)
                    .is('deleted_at', null),

                // Finance: Total Revenue (sum of paid invoices, using final_amount if discounted)
                fromSchema(SCHEMAS.EMS, 'invoices')
                    .select('amount, final_amount')
                    .eq('company_id', companyId)
                    .eq('status', 'paid')
                    .is('deleted_at', null),

                // Finance: Pending Invoices count
                fromSchema(SCHEMAS.EMS, 'invoices')
                    .select('id', { count: 'exact', head: true })
                    .eq('company_id', companyId)
                    .eq('status', 'pending')
                    .is('deleted_at', null),

                // Finance: Paid Invoices count
                fromSchema(SCHEMAS.EMS, 'invoices')
                    .select('id', { count: 'exact', head: true })
                    .eq('company_id', companyId)
                    .eq('status', 'paid')
                    .is('deleted_at', null),

                // Finance: Overdue Invoices count
                fromSchema(SCHEMAS.EMS, 'invoices')
                    .select('id', { count: 'exact', head: true })
                    .eq('company_id', companyId)
                    .eq('status', 'overdue')
                    .is('deleted_at', null),

                // Finance: Total Expenses (sum of non-deleted expenses)
                fromSchema(SCHEMAS.EMS, 'expenses')
                    .select('amount')
                    .eq('company_id', companyId)
                    .is('deleted_at', null),

                // Finance: Fee Payments (sum of all completed payments)
                fromSchema(SCHEMAS.EMS, 'fee_payments')
                    .select('amount_paid')
                    .eq('company_id', companyId)
                    .eq('payment_status', 'COMPLETED')
            ]);

            // Process active students
            const uniqueActiveStudentIds = new Set(
                activeStudentsResult.data?.map((e: any) => e.student_id) || []
            );

            const paidInvoicesTotal = (totalRevenueResult.data as any[])
                ?.reduce((sum: number, r: any) => sum + (Number(r.final_amount ?? r.amount) || 0), 0) ?? 0

            const feePaymentsTotal = (feePaymentsResult.data as any[])
                ?.reduce((sum: number, r: any) => sum + (Number(r.amount_paid) || 0), 0) ?? 0

            const totalRevenue = paidInvoicesTotal + feePaymentsTotal

            const totalExpenses = (totalExpensesResult.data as any[])
                ?.reduce((sum: number, r: any) => sum + (Number(r.amount) || 0), 0) ?? 0

            return {
                totalCourses: coursesResult.count || 0,
                publishedCourses: publishedCoursesResult.count || 0,
                totalBatches: batchesResult.count || 0,
                totalStudents: studentsResult.count || 0,
                totalTutors: (tutorsResult as any).count || 0,
                totalEnrollments: enrollmentsResult.count || 0,
                activeStudents: uniqueActiveStudentIds.size,
                completionRate: 0,
                totalRevenue: totalRevenue,
                totalExpenses: totalExpenses,
                pendingInvoices: pendingInvoicesResult.count || 0,
                paidInvoices: paidInvoicesResult.count || 0,
                overdueInvoices: overdueInvoicesResult.count || 0,
            };
        } catch (error: any) {
            console.error('[EMSStatisticsService] Error fetching dashboard stats:', error);
            throw new Error(`Failed to fetch dashboard statistics: ${error.message}`);
        }
    }

    /**
     * Get recent activity for dashboard
     * @param companyId - Company ID
     * @param limit - Number of recent items to fetch
     */
    static async getRecentActivity(companyId: number, limit: number = 10) {
        try {
            const { data, error } = await ems.enrollments()
                .select(`
                    id,
                    created_at,
                    students (
                        first_name,
                        last_name,
                        student_code
                    ),
                    courses (
                        course_name,
                        course_code
                    )
                `)
                .eq('company_id', companyId)
                .is('deleted_at', null)
                .order('created_at', { ascending: false })
                .limit(limit);

            if (error) throw error;
            return data || [];
        } catch (error: any) {
            console.error('[EMSStatisticsService] Error fetching recent activity:', error);
            throw new Error(`Failed to fetch recent activity: ${error.message}`);
        }
    }

    /**
     * Get course performance metrics
     * @param companyId - Company ID
     */
    static async getCoursePerformance(companyId: number) {
        try {
            const { data, error } = await ems.courses()
                .select(`
                    id,
                    course_name,
                    course_code,
                    enrollments (
                        id,
                        is_active
                    )
                `)
                .eq('company_id', companyId)
                .is('deleted_at', null)
                .order('created_at', { ascending: false })
                .limit(5);

            if (error) throw error;

            // Calculate enrollment counts
            const performance = data?.map((course: any) => ({
                courseId: course.id,
                courseName: course.course_name,
                courseCode: course.course_code,
                totalEnrollments: course.enrollments?.length || 0,
                activeEnrollments: course.enrollments?.filter((e: any) => e.is_active).length || 0,
            })) || [];

            return performance;
        } catch (error: any) {
            console.error('[EMSStatisticsService] Error fetching course performance:', error);
            throw new Error(`Failed to fetch course performance: ${error.message}`);
        }
    }
}
