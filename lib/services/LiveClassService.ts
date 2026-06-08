import { ems } from '@/lib/supabase';
import { Database } from '@/types/database';

type LiveClass = Database['ems']['Tables']['live_classes']['Row'];

/**
 * Service for Live Class Management
 * Handles scheduling and virtual classroom coordination
 */
export class LiveClassService {
    static async getAllLiveClasses(companyId: number, tutorId?: number) {
        let query = ems.liveClasses()
            .select(`
                *,
                courses:course_id (id, course_name, course_code),
                batches:batch_id (id, batch_name, batch_code),
                employees:tutor_id (id, first_name, last_name)
            `)
            .eq('company_id', companyId)
            .is('deleted_at', null);

        if (tutorId) {
            query = query.eq('tutor_id', tutorId);
        }

        const { data, error } = await query
            .order('scheduled_date', { ascending: true })
            .order('scheduled_time', { ascending: true });
        if (error) throw error;
        return data;
    }

    static async createLiveClass(classData: Partial<LiveClass>) {
        const { data, error } = await ems.liveClasses()
            .insert({
                ...classData,
                approval_status: 'PENDING'
            } as any)
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    static async updateClassStatus(id: number, status: string) {
        const { data, error } = await ems.liveClasses()
            .update({ status } as any)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    static async getUpcomingClasses(companyId: number, limit = 5) {
        const now = new Date().toISOString();
        const { data, error } = await ems.liveClasses()
            .select('*, courses:course_id (course_name)')
            .eq('company_id', companyId)
            .is('deleted_at', null)
            .gte('scheduled_date', now.split('T')[0])
            .order('scheduled_date', { ascending: true })
            .limit(limit);

        if (error) throw error;
        return data;
    }
}
