import { NextRequest } from 'next/server';
import { successResponse, handleError, AuthenticationError, NotFoundError } from '@/lib/errorHandler';
import { getUserIdFromToken } from '@/lib/jwt';
import { ems } from '@/lib/supabase';
import { StudentService } from '@/lib/services/StudentService';
import { requireMenuAccessAppRouter } from '@/lib/menuAccessAppRouter';
import { dataCache } from '@/lib/cache/dataCache';

const CACHE_TTL = 60 * 1000;

export async function GET(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) throw new AuthenticationError('Unauthorized');

        const menuAccess = await requireMenuAccessAppRouter(req, 'ems.students.materials');
        if (menuAccess instanceof Response) return menuAccess;

        const cacheKey = `ems_my_materials:${userId}`;
        const cached = await dataCache.get(cacheKey);
        if (cached) return successResponse(cached, 'Materials fetched successfully (cached)');

        // 1. Get student identity
        const student = await StudentService.getStudentByUserId(userId);
        if (!student) throw new NotFoundError('Student record');

        // 2. Get active enrollments for this student (Course & Batch)
        const { data: enrollments, error: enrollmentError } = await ems.enrollments()
            .select('course_id, batch_id')
            .eq('student_id', student.id)
            .eq('enrollment_status', 'ACTIVE')
            .is('deleted_at', null);

        if (enrollmentError) throw enrollmentError;

        if (!enrollments || enrollments.length === 0) {
            return successResponse([], 'No active enrollments found');
        }

        const courseIds = enrollments.map(e => e.course_id);
        const batchIds = enrollments.map(e => e.batch_id).filter(id => id !== null);

        // 3. Fetch materials for these courses/batches
        // Logic: 
        // - Must belong to one of the student's courses
        // - AND (batch_id is NULL OR batch_id matches student's specific batch)
        let query = ems.courseMaterials()
            .select(`
                *,
                course:courses(id, course_name, course_code)
            `)
            .in('course_id', courseIds)
            .eq('is_active', true)
            .is('deleted_at', null);

        const { data: allCourseMaterials, error: materialError } = await query;

        if (materialError) throw materialError;

        // 4. Client-side filter for batch specificity and target audience
        // We filter where:
        // - batch_id is null OR it's in the student's batch list
        // - target_audience is 'STUDENTS' or 'BOTH' (exclude 'TUTORS' only materials)
        const filteredMaterials = allCourseMaterials.filter(m => {
            // Check target audience first
            if (m.target_audience === 'TUTORS') {
                return false; // Exclude tutor-only materials
            }

            // If the material is specifically for a batch, student must be in that batch
            if (m.batch_id) {
                return batchIds.includes(m.batch_id);
            }
            // If batch_id is null, it's for everyone in the course
            return true;
        });

        await dataCache.set(cacheKey, filteredMaterials, CACHE_TTL);
        return successResponse(filteredMaterials, 'Materials fetched successfully');

    } catch (error: any) {
        console.error('Student my-materials error:', error);
        return handleError(error);
    }
}
