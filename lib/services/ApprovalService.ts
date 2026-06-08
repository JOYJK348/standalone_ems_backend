import { ems } from '@/lib/supabase';
import { AppError } from '@/lib/errorHandler';

/**
 * Service to handle Approve/Reject workflow for EMS content
 * Used by Academic Managers to review content submitted by Tutors
 */
export class ApprovalService {
    /**
     * Approve an item (Course, Lesson, Material, Assignment, Quiz)
     */
    static async approveItem(
        type: 'course' | 'lesson' | 'material' | 'assignment' | 'quiz' | 'batch' | 'live_class' | 'attendance_session',
        id: number,
        companyId: number,
        approvedBy: number
    ) {
        const table = this.getTable(type);

        const { data, error } = await table
            .update({
                approval_status: 'APPROVED',
                approved_at: new Date().toISOString(),
                approved_by: approvedBy,
                rejection_reason: null,
                is_active: true // Auto-activate on approval
            } as any)
            .eq('id', id)
            .eq('company_id', companyId)
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    /**
     * Reject an item with a reason
     */
    static async rejectItem(
        type: 'course' | 'lesson' | 'material' | 'assignment' | 'quiz' | 'batch' | 'live_class' | 'attendance_session',
        id: number,
        companyId: number,
        rejectedBy: number,
        reason: string
    ) {
        if (!reason) throw new AppError('VALIDATION_ERROR', 'Rejection reason is required', 400);

        const table = this.getTable(type);

        const { data, error } = await table
            .update({
                approval_status: 'REJECTED',
                rejection_reason: reason,
                approved_at: null,
                approved_by: null,
                is_active: false // Deactivate on rejection
            } as any)
            .eq('id', id)
            .eq('company_id', companyId)
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    /**
     * Get pending items for review
     */
    static async getPendingItems(companyId: number) {
        const [courses, lessons, materials, assignments, quizzes, batches, liveClasses, attendanceSessions] = await Promise.all([
            this.fetchPending('course', companyId),
            this.fetchPending('lesson', companyId),
            this.fetchPending('material', companyId),
            this.fetchPending('assignment', companyId),
            this.fetchPending('quiz', companyId),
            this.fetchPending('batch', companyId),
            this.fetchPending('live_class', companyId),
            this.fetchPending('attendance_session', companyId)
        ]);

        return {
            courses,
            lessons,
            materials,
            assignments,
            quizzes,
            batches,
            live_classes: liveClasses,
            attendance_sessions: attendanceSessions
        };
    }

    /**
     * Private helper to get the table query builder
     */
    private static getTable(type: string) {
        switch (type) {
            case 'course': return ems.courses();
            case 'lesson': return ems.lessons();
            case 'material': return ems.courseMaterials();
            case 'assignment': return ems.assignments();
            case 'quiz': return ems.quizzes();
            case 'batch': return ems.batches();
            case 'live_class': return ems.liveClasses();
            case 'attendance_session': return ems.attendanceSessions();
            default: throw new AppError('INVALID_TYPE', `Unknown content type: ${type}`, 400);
        }
    }

    /**
     * Fetch pending items for a specific type
     */
    private static async fetchPending(type: string, companyId: number) {
        const table = this.getTable(type);

        // Build base query
        let query = table.select('*').eq('company_id', companyId).eq('approval_status', 'PENDING');

        // Add joins based on type for better context
        if (type === 'lesson' || type === 'material' || type === 'assignment' || type === 'quiz' || type === 'batch' || type === 'attendance_session') {
            query = table.select('*, course:courses(course_name)').eq('company_id', companyId).eq('approval_status', 'PENDING');
        } else if (type === 'live_class') {
            query = table.select('*, courses:course_id(course_name)').eq('company_id', companyId).eq('approval_status', 'PENDING');
        }

        const { data, error } = await query.order('created_at', { ascending: false });
        if (error) return [];
        return data.map(item => ({ ...item, entity_type: type }));
    }
}
