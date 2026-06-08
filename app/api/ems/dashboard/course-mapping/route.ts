/**
 * EMS API - Course Mapping (Tutors & Students)
 * Route: /api/ems/dashboard/course-mapping
 */

import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/errorHandler';
import { getUserTenantScope } from '@/middleware/tenantFilter';
import { getUserIdFromToken } from '@/lib/jwt';
import { ems, core } from '@/lib/supabase';
import { dataCache } from '@/lib/cache/dataCache';
import { requireMenuAccessAppRouter } from '@/lib/menuAccessAppRouter';

export async function GET(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse(null, 'Unauthorized', 401);

        const menuAccess = await requireMenuAccessAppRouter(req, 'ems.dashboard.mapping');
        if (menuAccess instanceof Response) return menuAccess;

        const scope = await getUserTenantScope(userId);

        if (!scope.companyId) {
            return errorResponse(null, 'Company context required', 400);
        }

        // 🚀 CACHE CHECK
        let cacheKey = `course_mapping:${scope.companyId}:${scope.emsProfile?.profileId || 'admin'}`;
        const cachedData = await dataCache.get(cacheKey);
        if (cachedData) {
            return successResponse(cachedData, 'Course mappings (cached)');
        }

        // Fetch courses (Apply Role-Based Filtering for Tutors)
        let query = ems.courses()
            .select('id, course_code, course_name, status, is_published, tutor_id')
            .eq('company_id', scope.companyId)
            .eq('is_active', true)
            .order('course_code');

        if (scope.emsProfile?.profileType === 'tutor' && scope.emsProfile.profileId) {
            // 1. Get IDs from new course_tutors junction table
            const { data: junctionMappings } = await ems.courseTutors()
                .select('course_id')
                .eq('tutor_id', scope.emsProfile.profileId)
                .is('deleted_at', null);

            // 2. Get IDs from legacy tutor_id column
            const { data: legacyCourses } = await ems.courses()
                .select('id')
                .eq('tutor_id', scope.emsProfile.profileId)
                .is('deleted_at', null);

            const assignedCourseIds = [
                ...(junctionMappings?.map((m: any) => m.course_id) || []),
                ...(legacyCourses?.map((c: any) => c.id) || [])
            ];

            const uniqueCourseIds = [...new Set(assignedCourseIds)];

            if (uniqueCourseIds.length > 0) {
                query = query.in('id', uniqueCourseIds);
            } else {
                return successResponse([], 'No courses found for this tutor');
            }
        }

        const { data: courses, error: coursesError } = await query;

        if (coursesError) {
            console.error('Error fetching courses:', coursesError);
            throw coursesError;
        }

        if (!courses || courses.length === 0) {
            return successResponse([], 'No courses found');
        }

        const courseIds = courses.map((c: any) => c.id);

        // 1. FETCH MULTIPLE TUTORS PER COURSE
        const { data: courseTutors, error: ctError } = await ems.supabase
            .schema('ems')
            .from('course_tutors')
            .select('course_id, tutor_id, is_primary, tutor_role')
            .in('course_id', courseIds)
            .is('deleted_at', null);

        if (ctError) {
            console.error('Error fetching course tutors:', ctError);
        }

        // Get unique tutor IDs from both new junction table and legacy tutor_id column
        const junctionTutorIds = (courseTutors || []).map((ct: any) => ct.tutor_id);
        const legacyTutorIds = courses.map((c: any) => c.tutor_id).filter(Boolean);
        const tutorIds = [...new Set([...junctionTutorIds, ...legacyTutorIds])];

        // Fetch all tutor details from core schema
        let tutorsMap = new Map();
        if (tutorIds.length > 0) {
            const { data: tutors, error: tutorsError } = await core.employees()
                .select('id, first_name, last_name, email, employee_code')
                .in('id', tutorIds)
                .eq('company_id', scope.companyId);

            if (tutorsError) {
                console.error('Error fetching tutors:', tutorsError);
            } else if (tutors) {
                tutors.forEach((t: any) => {
                    tutorsMap.set(t.id, t);
                });
            }
        }

        // 2. FETCH ENROLLMENTS & STUDENTS
        const { data: enrollments, error: enrollError } = await ems.enrollments()
            .select('id, course_id, student_id, enrollment_status')
            .in('course_id', courseIds)
            .eq('company_id', scope.companyId)
            .in('enrollment_status', ['ENROLLED', 'IN_PROGRESS', 'ACTIVE']);

        if (enrollError) console.error('Error fetching enrollments:', enrollError);

        const studentIds = [...new Set((enrollments || []).map((e: any) => e.student_id).filter(Boolean))];

        let studentsMap = new Map();
        if (studentIds.length > 0) {
            const { data: students, error: studentsError } = await ems.students()
                .select('id, first_name, last_name, email, student_code')
                .in('id', studentIds)
                .eq('company_id', scope.companyId);

            if (studentsError) {
                console.error('Error fetching students:', studentsError);
            } else if (students) {
                students.forEach((s: any) => {
                    studentsMap.set(s.id, s);
                });
            }
        }

        // 3. BUILD MAPPINGS
        const courseMappings = courses.map((course: any) => {
            let assignedTutors = (courseTutors || [])
                .filter((ct: any) => ct.course_id === course.id)
                .map((ct: any) => {
                    const tInfo = tutorsMap.get(ct.tutor_id);
                    if (!tInfo) return null;
                    return {
                        id: tInfo.id,
                        name: `${tInfo.first_name} ${tInfo.last_name}`,
                        email: tInfo.email,
                        employeeCode: tInfo.employee_code,
                        isPrimary: ct.is_primary,
                        role: ct.tutor_role
                    };
                })
                .filter(Boolean);

            // FALLBACK: If no tutors found in junction table, check the legacy tutor_id column
            if (assignedTutors.length === 0 && course.tutor_id) {
                const tInfo = tutorsMap.get(course.tutor_id);
                if (tInfo) {
                    assignedTutors = [{
                        id: tInfo.id,
                        name: `${tInfo.first_name} ${tInfo.last_name}`,
                        email: tInfo.email,
                        employeeCode: tInfo.employee_code,
                        isPrimary: true, // Legacy tutor is always primary
                        role: 'INSTRUCTOR' // Default role
                    }];
                }
            }

            const primaryTutor = assignedTutors.find((t: any) => t.isPrimary) || assignedTutors[0] || null;

            const courseEnrollments = (enrollments || []).filter((e: any) => e.course_id === course.id);
            const students = courseEnrollments
                .map((e: any) => studentsMap.get(e.student_id))
                .filter(Boolean);

            return {
                courseId: course.id,
                courseCode: course.course_code,
                courseName: course.course_name,
                status: course.status,
                isPublished: course.is_published,
                // Old field for compatibility (Primary Tutor)
                tutor: primaryTutor,
                // New field for multi-tutor support
                tutors: assignedTutors,
                students: students.map((s: any) => ({
                    id: s.id,
                    name: `${s.first_name} ${s.last_name}`,
                    email: s.email,
                    studentCode: s.student_code
                })),
                studentCount: students.length
            };
        });

        // 🚀 CACHE SET
        cacheKey = `course_mapping:${scope.companyId}:${scope.emsProfile?.profileId || 'admin'}`;
        await dataCache.set(cacheKey, courseMappings, 120 * 1000); // 2 minutes cache

        return successResponse(courseMappings, 'Course mappings fetched successfully');

    } catch (error: any) {
        console.error('Error fetching course mappings:', error);
        return errorResponse(null, error.message || 'Failed to fetch course mappings');
    }
}
