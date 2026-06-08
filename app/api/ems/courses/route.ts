/**
 * EMS API - Courses (Multi-Tenant) - SIMPLIFIED & BULLETPROOF
 * Route: /api/ems/courses
 */

import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/errorHandler';
import { getUserTenantScope, autoAssignCompany } from '@/middleware/tenantFilter';
import { getUserIdFromToken } from '@/lib/jwt';
import { courseSchema } from '@/lib/validations/ems';
import { CourseService } from '@/lib/services/CourseService';
import { ems, core } from '@/lib/supabase';
import { dataCache } from '@/lib/cache/dataCache';
import { requireMenuAccessAppRouter } from '@/lib/menuAccessAppRouter';

export async function GET(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse(null, 'Unauthorized', 401);

        const menuAccess = await requireMenuAccessAppRouter(req, 'ems.courses');
        if (menuAccess instanceof Response) return menuAccess;

        const scope = await getUserTenantScope(userId);

        if (!scope.companyId) {
            return errorResponse(null, 'Company context not found', 400);
        }

        // Pagination
        const { searchParams } = new URL(req.url);
        const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
        const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20')));
        const offset = (page - 1) * limit;

        // Get total count
        let countQuery = ems.courses()
            .select('id', { count: 'exact', head: true })
            .eq('company_id', scope.companyId)
            .is('deleted_at', null);

        // 🚀 CACHE CHECK
        const roleKey = scope.roleName || 'UNKNOWN';
        let cacheKey = `ems_courses:${scope.companyId}:${roleKey}:p${page}`;
        const cachedData = await dataCache.get(cacheKey);
        if (cachedData) {
            return successResponse(cachedData, 'Courses fetched successfully (cached)');
        }

        let courseQuery = ems.courses()
            .select('id, course_name, course_code, course_description, thumbnail_url, total_lessons, course_level, duration_hours, price, status, is_published, course_category, enrollment_capacity, tutor_id, approval_status, rejection_reason, created_at, updated_at')
            .eq('company_id', scope.companyId)
            .is('deleted_at', null);

        // TUTOR: only show assigned courses
        if (roleKey === 'TUTOR') {
            const { data: emp } = await core.employees()
                .select('id')
                .eq('user_id', userId)
                .eq('company_id', scope.companyId)
                .single();

            if (emp) {
                const { data: tc } = await ems.courseTutors()
                    .select('course_id')
                    .eq('tutor_id', emp.id)
                    .is('deleted_at', null);
                const tutorCourseIds = tc?.map(t => t.course_id) || [];

                const { data: lc } = await ems.courses()
                    .select('id')
                    .eq('tutor_id', emp.id)
                    .is('deleted_at', null);
                const legacyCourseIds = lc?.map(c => c.id) || [];

                const allIds = [...new Set([...tutorCourseIds, ...legacyCourseIds])];

                if (allIds.length > 0) {
                    courseQuery = courseQuery.in('id', allIds);
                    countQuery = countQuery.in('id', allIds);
                } else {
                    return successResponse({ courses: [], total: 0, page, limit }, 'No courses assigned');
                }
            }
        }

        const [countResult, coursesResult] = await Promise.all([
            countQuery,
            courseQuery.order('created_at', { ascending: false }).range(offset, offset + limit - 1)
        ]);

        const total = countResult.count || 0;
        const { data: courses, error: coursesError } = coursesResult;

        if (coursesError) {
            console.error('❌ [COURSES API] Database error:', coursesError);
            throw coursesError;
        }

        const courseCount = courses?.length || 0;

        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`✅ [COURSES API] Successfully fetched ${courseCount} courses`);
        console.log('   Course IDs:', courses?.map(c => c.id).join(', ') || 'none');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        // 🚀 CACHE SET
        cacheKey = `ems_courses:${scope.companyId}:${roleKey}`;
        await dataCache.set(cacheKey, courses || [], 2 * 60 * 1000); // 2 minutes cache

        const response = successResponse(
            { courses: courses || [], total, page, limit },
            `Courses fetched successfully (${courses?.length || 0} records)`,
            200
        );

        return response;

    } catch (error: any) {
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.error('❌ [COURSES API] Fatal Error:', error);
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        return errorResponse(null, error.message || 'Failed to fetch courses');
    }
}

export async function POST(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse(null, 'Unauthorized', 401);

        const menuAccess = await requireMenuAccessAppRouter(req, 'ems.courses');
        if (menuAccess instanceof Response) return menuAccess;

        let data = await req.json();
        data = await autoAssignCompany(userId, data);

        const scope = await getUserTenantScope(userId);
        if (scope.roleLevel >= 3) {
            data.status = 'PUBLISHED';
            data.is_published = true;
        }

        const validatedData = courseSchema.parse(data);

        const course = await CourseService.createCourse(validatedData);

        console.log(`✅ [COURSES API] Course created: ${course.id} - ${course.course_name}`);

        return successResponse(course, 'Course created successfully', 201);

    } catch (error: any) {
        if (error.name === 'ZodError') {
            return errorResponse(error.errors, 'Validation failed', 400);
        }
        console.error('❌ [COURSES API] Create error:', error);
        return errorResponse(null, error.message || 'Failed to create course');
    }
}
