import { ems } from '@/lib/supabase';
import { Course, CourseModule, Lesson } from '@/types/database';
import { TutorService } from './TutorService';

/**
 * Service for Course and Content management
 */
export class CourseService {
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 1. COURSE MANAGEMENT (Multi-Tenant with Role-Based Filtering)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    /**
     * Get all courses with intelligent role-based filtering
     * @param companyId - Company ID for tenant isolation
     * @param emsProfile - Optional EMS profile for role-based filtering
     */
    static async getAllCourses(
        companyId: number,
        emsProfile?: { profileType: 'tutor' | 'student' | 'manager' | null; profileId: number | null }
    ) {
        console.log(`📡 [CourseService] Fetching courses for Company: ${companyId}, Profile Type: ${emsProfile?.profileType}, Profile ID: ${emsProfile?.profileId}`);

        let query = ems.courses()
            .select('*')
            .is('deleted_at', null);

        // Only filter by company if one is provided (Platform admins can see all if not scoped)
        if (companyId) {
            query = query.eq('company_id', companyId);
        }

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // ROLE-BASED FILTERING
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

        if (emsProfile?.profileType === 'tutor' && emsProfile.profileId) {
            // TUTORS: Only see courses they are assigned to teach
            // 1. Get IDs from new course_tutors junction table
            const { data: junctionMappings } = await ems.courseTutors()
                .select('course_id')
                .eq('tutor_id', emsProfile.profileId)
                .is('deleted_at', null);

            // 2. Get IDs from legacy tutor_id column in courses table
            const { data: legacyCourses } = await ems.courses()
                .select('id')
                .eq('tutor_id', emsProfile.profileId)
                .eq('company_id', companyId)
                .is('deleted_at', null);

            const assignedCourseIds = [
                ...(junctionMappings?.map((m: any) => m.course_id) || []),
                ...(legacyCourses?.map((c: any) => c.id) || [])
            ];

            const uniqueCourseIds = [...new Set(assignedCourseIds)];

            if (uniqueCourseIds.length > 0) {
                query = query.in('id', uniqueCourseIds);
            } else {
                // Tutor is not assigned to any courses
                return [];
            }
        } else if (emsProfile?.profileType === 'student' && emsProfile.profileId) {
            // STUDENTS: Only see courses they are enrolled in AND are APPROVED
            const { data: enrollments } = await ems.enrollments()
                .select('course_id')
                .eq('student_id', emsProfile.profileId)
                .eq('is_active', true);

            const enrolledCourseIds = enrollments?.map((e: any) => e.course_id) || [];

            if (enrolledCourseIds.length > 0) {
                query = query.in('id', enrolledCourseIds).eq('approval_status', 'APPROVED');
            } else {
                return [];
            }
        }
        // MANAGERS & ADMINS: See all company courses including PENDING/REJECTED
        // TUTORS: Already filtered to their assigned courses above, no extra approval filter (they need to see their PENDING items)

        const { data, error } = await query.order('created_at', { ascending: false });

        if (error) {
            console.error('❌ [CourseService] Error fetching courses:', error);
            throw error;
        }

        console.log(`✅ [CourseService] Found ${data?.length || 0} courses`);
        return data as Course[];
    }

    /**
     * Get course details with nested modules and lessons
     * @param id - Course ID
     * @param emsProfile - Optional profile for filtering visibility
     */
    static async getCourseDetails(
        id: number,
        companyId: number,
        emsProfile?: { profileType: 'tutor' | 'student' | 'manager' | null; profileId: number | null }
    ) {
        let query = ems.courses()
            .select(`
                *,
                course_materials (*),
                course_modules (
                    *,
                    course_materials (*),
                    lessons (
                        *,
                        course_materials (*)
                    )
                )
            `)
            .eq('id', id)
            .eq('company_id', companyId)
            .is('deleted_at', null);

        // 🕵️ Visibility Filtering for Tutors
        if (emsProfile?.profileType === 'tutor' && emsProfile.profileId) {
            const { data: junctionMapping } = await ems.courseTutors()
                .select('id')
                .eq('course_id', id)
                .eq('tutor_id', emsProfile.profileId)
                .is('deleted_at', null)
                .single();

            const { data: legacyCourse } = await ems.courses()
                .select('id')
                .eq('id', id)
                .eq('tutor_id', emsProfile.profileId)
                .single();

            if (!junctionMapping && !legacyCourse) {
                throw new Error('You are not assigned to this course');
            }
        }

        const { data, error } = await query.single();

        if (error) throw error;

        // 🕵️ Check Enrollment for Students
        let isEnrolled = false;
        if (emsProfile?.profileType === 'student' && emsProfile.profileId) {
            const { data: enrollment } = await ems.enrollments()
                .select('id')
                .eq('student_id', emsProfile.profileId)
                .eq('course_id', id)
                .eq('enrollment_status', 'ACTIVE')
                .maybeSingle();

            isEnrolled = !!enrollment;
        }

        // 🛡️ Post-process: Professional Numbering and Visibility Filtering
        if (data && data.course_modules) {
            // Sort modules first
            data.course_modules.sort((a: any, b: any) => (a.module_order || 0) - (b.module_order || 0));

            // Helper to process materials based on role
            const processMaterials = (materials: any[] | undefined) => {
                if (!materials) return [];

                return materials.filter(mat => {
                    // Managers see everything
                    if (emsProfile?.profileType === 'manager') return true;
                    // Tutors see everything
                    if (emsProfile?.profileType === 'tutor') return true;

                    // Students: Only see APPROVED materials + active + target audience match
                    if (emsProfile?.profileType === 'student') {
                        const isStudentAudience = mat.target_audience === 'STUDENTS' || mat.target_audience === 'BOTH';
                        return mat.is_active && isStudentAudience && mat.approval_status === 'APPROVED';
                    }

                    return mat.is_active;
                }).map((mat: any) => ({
                    ...mat,
                    visibility: mat.is_active ? 'ENROLLED' : 'PRIVATE'
                }));
            };

            // Process Course Level Materials
            data.course_materials = processMaterials(data.course_materials);

            data.course_modules = data.course_modules.map((module: any, mIdx: number) => {
                const moduleNumber = mIdx + 1;

                // COMPUTE VISIBILITY FOR MODULE
                module.visibility = module.is_active ? 'ENROLLED' : 'PRIVATE';

                // 🛡️ STUDENT FILTER: Must be APPROVED
                if (emsProfile?.profileType === 'student' && module.approval_status !== 'APPROVED') {
                    module.visibility = 'PRIVATE';
                }

                // Process Module Level Materials
                module.course_materials = processMaterials(module.course_materials);

                // Sort lessons within module
                const lessons = (module.lessons || []).sort((a: any, b: any) => (a.lesson_order || 0) - (b.lesson_order || 0));

                return {
                    ...module,
                    module_number: moduleNumber,
                    lessons: lessons.map((lesson: any, lIdx: number) => {
                        const lessonNumber = `${moduleNumber}.${lIdx + 1}`;

                        // COMPUTE VISIBILITY FOR LESSON
                        if (!lesson.is_active) lesson.visibility = 'PRIVATE';
                        else if (lesson.is_preview) lesson.visibility = 'PUBLIC';
                        else lesson.visibility = 'ENROLLED';

                        // 🛡️ STUDENT FILTER: Must be APPROVED
                        if (emsProfile?.profileType === 'student' && lesson.approval_status !== 'APPROVED') {
                            lesson.visibility = 'PRIVATE';
                        }

                        const isLocked = emsProfile?.profileType === 'student' && lesson.visibility === 'ENROLLED' && !isEnrolled;

                        // Process Lesson Level Materials
                        lesson.course_materials = processMaterials(lesson.course_materials);

                        return {
                            ...lesson,
                            lesson_number: lessonNumber,
                            is_locked: isLocked,
                            video_url: isLocked ? null : lesson.video_url,
                            content_body: isLocked ? null : lesson.content_body
                        };
                    })
                };
            });

            // If student, filter out PRIVATE modules/lessons
            if (emsProfile?.profileType === 'student') {
                data.course_modules = data.course_modules
                    .filter((m: any) => m.visibility !== 'PRIVATE') // Use computed visibility
                    .map((m: any) => ({
                        ...m,
                        lessons: m.lessons.filter((l: any) => l.visibility !== 'PRIVATE') // Use computed visibility
                    }));
            }
        }

        return data;
    }

    static async updateContentVisibility(
        type: 'module' | 'lesson' | 'material',
        id: number,
        visibility: 'PUBLIC' | 'PRIVATE' | 'ENROLLED',
        companyId: number
    ) {
        let table;
        const updates: any = {};

        if (type === 'module') {
            table = ems.courseModules();
            // Modules: PRIVATE -> is_active=false, Others -> is_active=true
            updates.is_active = visibility !== 'PRIVATE';
            // Modules don't support preview/public distinction in schema yet
        }
        else if (type === 'lesson') {
            table = ems.lessons();
            // Lessons: PRIVATE -> is_active=false
            // ENROLLED -> is_active=true, is_preview=false
            // PUBLIC -> is_active=true, is_preview=true
            updates.is_active = visibility !== 'PRIVATE';
            updates.is_preview = visibility === 'PUBLIC';
        }
        else {
            table = ems.courseMaterials();
            // Materials: PRIVATE -> is_active=false, Others -> is_active=true
            updates.is_active = visibility !== 'PRIVATE';
            // Note: course_materials in V2 schema doesn't have is_preview or is_published
        }

        const { data, error } = await table
            .update(updates)
            .eq('id', id)
            .eq('company_id', companyId)
            .select()
            .single();

        if (error) throw error;

        // Return with virtual visibility property for frontend compatibility
        return {
            ...data,
            visibility // Pass back what was requested so UI updates correctly
        };
    }

    static async createCourse(courseData: Partial<Course>) {
        // Strip frontend-only fields not in DB schema
        delete (courseData as any).enabled_practice_modules;

        // Set default approval status
        if (!courseData.approval_status) {
            (courseData as any).approval_status = 'PENDING';
        }

        const { data, error } = await ems.courses()
            .insert(courseData)
            .select()
            .single();

        if (error) throw error;

        // Auto-assign role if tutor is selected
        if (courseData.tutor_id && courseData.company_id) {
            try {
                await TutorService.assignTutorRole(courseData.company_id, courseData.tutor_id);
            } catch (err) {
                console.warn('⚠️ [CourseService] Failed to auto-assign tutor role:', err);
                // Don't fail the course creation, just warn
            }
        }

        return data as Course;
    }

    static async getCourseById(
        id: number,
        companyId: number,
        emsProfile?: { profileType: 'tutor' | 'student' | 'manager' | null; profileId: number | null }
    ) {
        // 🕵️ Visibility Filtering for Tutors
        if (emsProfile?.profileType === 'tutor' && emsProfile.profileId) {
            const { data: junctionMapping } = await ems.courseTutors()
                .select('id')
                .eq('course_id', id)
                .eq('tutor_id', emsProfile.profileId)
                .is('deleted_at', null)
                .single();

            const { data: legacyCourse } = await ems.courses()
                .select('id')
                .eq('id', id)
                .eq('tutor_id', emsProfile.profileId)
                .single();

            if (!junctionMapping && !legacyCourse) {
                return null; // Equivalent to course not found for this tutor
            }
        }

        const { data, error } = await ems.courses()
            .select('*')
            .eq('id', id)
            .eq('company_id', companyId)
            .is('deleted_at', null)
            .single();

        if (error) throw error;
        return data as Course;
    }

    static async updateCourse(id: number, companyId: number, courseData: Partial<Course>) {
        const { data, error } = await ems.courses()
            .update(courseData)
            .eq('id', id)
            .eq('company_id', companyId)
            .is('deleted_at', null)
            .select()
            .single();

        if (error) throw error;

        // Auto-assign role if tutor is selected
        if (courseData.tutor_id) {
            try {
                await TutorService.assignTutorRole(companyId, courseData.tutor_id);
            } catch (err) {
                console.warn('⚠️ [CourseService] Failed to auto-assign tutor role:', err);
            }
        }

        return data as Course;
    }

    static async deleteCourse(id: number, companyId: number, deletedBy: number, reason?: string) {
        const { data, error } = await ems.courses()
            .update({
                deleted_at: new Date().toISOString(),
                deleted_by: deletedBy,
                delete_reason: reason || 'Removed by admin',
                is_active: false
            } as any)
            .eq('id', id)
            .eq('company_id', companyId)
            .is('deleted_at', null)
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    static async softDeleteCourse(id: number, deletedBy: number, reason?: string) {
        const { data, error } = await ems.courses()
            .update({
                deleted_at: new Date().toISOString(),
                deleted_by: deletedBy,
                delete_reason: reason,
                is_active: false
            } as any)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 2. MODULE & LESSON MANAGEMENT
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    static async createModule(moduleData: any) {
        // Map visibility to is_active
        if (moduleData.visibility) {
            moduleData.is_active = moduleData.visibility !== 'PRIVATE';
            delete moduleData.visibility;
        }

        moduleData.approval_status = 'PENDING';

        const { data, error } = await ems.courseModules()
            .insert({
                ...moduleData,
                approval_status: 'PENDING'
            })
            .select()
            .single();

        if (error) throw error;
        return data as CourseModule;
    }

    static async createLesson(lessonData: any) {
        // Map visibility
        if (lessonData.visibility) {
            lessonData.is_active = lessonData.visibility !== 'PRIVATE';
            lessonData.is_preview = lessonData.visibility === 'PUBLIC';
            delete lessonData.visibility;
        }

        lessonData.approval_status = 'PENDING';

        const { data, error } = await ems.lessons()
            .insert(lessonData)
            .select()
            .single();

        if (error) throw error;
        return data as Lesson;
    }

    static async updateLesson(id: number, lessonData: Partial<Lesson>) {
        const { data, error } = await ems.lessons()
            .update(lessonData)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return data as Lesson;
    }

    static async createMaterial(materialData: any) {
        // Map visibility
        if (materialData.visibility) {
            materialData.is_active = materialData.visibility !== 'PRIVATE';
            delete materialData.visibility;
        }

        materialData.approval_status = 'PENDING';
        delete materialData.is_published;

        // Ensure defaults
        if (materialData.is_active === undefined) materialData.is_active = true;

        const { data, error } = await ems.courseMaterials()
            .insert(materialData)
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    static async getMaterialsByMenu(menuId: number, companyId: number) {
        const { data, error } = await ems.courseMaterials()
            .select('*')
            .eq('menu_id', menuId)
            .eq('company_id', companyId)
            .eq('is_active', true)
            .eq('is_published', true);

        if (error) throw error;
        return data;
    }

    static async getGlobalMaterials(companyId: number) {
        const { data, error } = await ems.courseMaterials()
            .select('*')
            .eq('company_id', companyId)
            .is('course_id', null)
            .eq('is_active', true)
            .eq('is_published', true);

        if (error) throw error;
        return data;
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 3. STUDENT ENROLLMENT LOGIC
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    static async getBatchesByCourse(courseId: number) {
        const { data, error } = await ems.batches()
            .select('*')
            .eq('course_id', courseId)
            .eq('is_active', true);

        if (error) throw error;
        return data;
    }
}
