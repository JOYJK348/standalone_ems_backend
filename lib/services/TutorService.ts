import { supabaseService } from '@/lib/supabase';
import { SCHEMAS } from '@/config/constants';
import bcrypt from 'bcryptjs';

export interface Tutor {
    id: number;
    company_id: number;
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    is_active: boolean;
    user_id?: number;
    employee_code: string;
    specialization?: string;
}

export class TutorService {
    static async getAllTutors(companyId: number, courseId?: number) {
        const { core, ems, app_auth } = require('@/lib/supabase');

        let employees: any[] = [];

        if (courseId) {
            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            // FILTER BY COURSE ASSIGNMENT
            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

            // Find tutors assigned to this specific course
            const { data: junctionTutors } = await ems.courseTutors()
                .select('tutor_id')
                .eq('course_id', courseId)
                .is('deleted_at', null);

            const { data: legacyCourse } = await ems.courses()
                .select('tutor_id')
                .eq('id', courseId)
                .is('deleted_at', null);

            const assignedTutorIds = new Set([
                ...(junctionTutors?.map((j: any) => j.tutor_id) || []),
                ...(legacyCourse?.map((c: any) => c.tutor_id).filter((id: any) => id !== null) || [])
            ]);

            if (assignedTutorIds.size === 0) return []; // No tutors for this course

            const { data: emps, error } = await core.employees()
                .select('*')
                .eq('company_id', companyId)
                .in('id', Array.from(assignedTutorIds))
                .is('deleted_at', null);

            if (error) throw error;
            employees = emps || [];

        } else {
            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            // GENERAL LIST (Role-Based OR Designation-Based)
            // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

            // 1. By User Role (Strict)
            const { data: roles } = await app_auth.roles()
                .select('id, name')
                .in('name', ['TUTOR', 'ACADEMIC_MANAGER']);

            const relevantRoleIds = roles?.map((r: any) => r.id) || [];

            const { data: userRoles } = await app_auth.userRoles()
                .select('user_id')
                .eq('company_id', companyId)
                .in('role_id', relevantRoleIds);
            // .is('deleted_at', null);

            const tutorUserIds = userRoles?.map((ur: any) => ur.user_id) || [];

            // 2. By Designation (Implicit Fallback)
            const { data: designations } = await core.designations()
                .select('id')
                .eq('company_id', companyId)
                .or('title.ilike.%Tutor%,title.ilike.%Instructor%,title.ilike.%Professor%,title.ilike.%Teacher%,title.ilike.%Lecturer%,title.ilike.%Faculty%');

            const implicitDesignationIds = designations?.map((d: any) => d.id) || [];

            // 3. Construct Query
            let query = core.employees()
                .select('*')
                .eq('company_id', companyId)
                .is('deleted_at', null);

            const conditions = [];
            if (tutorUserIds.length > 0) conditions.push(`user_id.in.(${tutorUserIds.join(',')})`);
            if (implicitDesignationIds.length > 0) conditions.push(`designation_id.in.(${implicitDesignationIds.join(',')})`);

            // If we find ANY match criteria, we execute OR. 
            // If neither search yields results (no roles assigned, no tutor designations), 
            // we return empty array to avoid listing random employees.
            if (conditions.length > 0) {
                query = query.or(conditions.join(','));
                const { data: emps, error } = await query;
                if (error) throw error;
                employees = emps || [];
            } else {
                // FALLBACK: If absolutely no one matches "Tutor" criteria, return ALL employees.
                // This ensures the dropdown is not empty during initial setup.
                const { data: allEmps, error: allErr } = await core.employees()
                    .select('*')
                    .eq('company_id', companyId)
                    .is('deleted_at', null)
                    .limit(50); // Limit to 50 to avoid performance hit on large orgs

                if (!allErr) {
                    employees = allEmps || [];
                }
            }
        }

        if (employees.length === 0) return [];

        const tutorIds = employees.map((e: any) => e.id);

        // 3. (Optional) Fetch total course counts for UI reference
        const { data: legacyCourses } = await ems.courses()
            .select('tutor_id, id')
            .in('tutor_id', tutorIds)
            .eq('company_id', companyId)
            .is('deleted_at', null);

        const { data: junctionMappings } = await ems.courseTutors()
            .select('tutor_id, course_id')
            .in('tutor_id', tutorIds)
            .is('deleted_at', null);

        // 4. Merge and return
        const tutorsWithCount = employees.map((t: any) => {
            const assignedCourseIds = new Set([
                ...(legacyCourses?.filter((c: any) => c.tutor_id === t.id).map((c: any) => c.id) || []),
                ...(junctionMappings?.filter((m: any) => m.tutor_id === t.id).map((m: any) => m.course_id) || [])
            ]);

            return {
                ...t,
                courses_assigned: assignedCourseIds.size
            };
        });

        return tutorsWithCount;
    }

    /**
     * Create a new tutor with User account
     */
    static async createTutor(tutorData: any) {
        if (!tutorData.first_name) throw new Error('First name is required');
        if (!tutorData.email) throw new Error('Email is required');
        if (!tutorData.password) throw new Error('Password is required');

        const { core, app_auth } = require('@/lib/supabase');

        // 🛡️ Pre-emptive check for Required References (Avoid NULLs in core.employees)
        // Find or Use Default Department: Academic (ID fallback)
        const { data: dept } = await core.departments()
            .select('id')
            .eq('company_id', tutorData.company_id)
            .ilike('name', '%Academic%')
            .maybeSingle();

        // Find or Use Default Designation: Tutor (ID fallback)
        const { data: desig } = await core.designations()
            .select('id')
            .eq('company_id', tutorData.company_id)
            .ilike('title', '%Tutor%')
            .maybeSingle();

        // 1. Check if user already exists
        const { data: existingUser } = await app_auth.users()
            .select('id')
            .eq('email', tutorData.email.toLowerCase())
            .maybeSingle();

        let userId: number;

        if (existingUser) {
            userId = existingUser.id;
            // Optionally update password if provided and user exists
            if (tutorData.password) {
                const salt = await bcrypt.genSalt(10);
                const hashedPassword = await bcrypt.hash(tutorData.password, salt);
                await app_auth.users().update({
                    password_hash: hashedPassword,
                    updated_at: new Date().toISOString()
                }).eq('id', userId);
            }
        } else {
            // 2. Create User Account
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(tutorData.password, salt);

            const { data: newUser, error: userError } = await app_auth.users()
                .insert({
                    email: tutorData.email.toLowerCase(),
                    password_hash: hashedPassword,
                    first_name: tutorData.first_name,
                    last_name: tutorData.last_name,
                    display_name: `${tutorData.first_name} ${tutorData.last_name}`,
                    is_active: true,
                    is_verified: true
                })
                .select('id')
                .single();

            if (userError) {
                console.error('❌ [TutorService] Error creating auth user:', userError);
                throw new Error(`Auth Account Error: ${userError.message}`);
            }
            userId = newUser.id;
        }

        // 3. Assign/Ensure TUTOR Role exists for this company
        const { data: roleData } = await app_auth.roles()
            .select('id')
            .eq('name', 'TUTOR')
            .single();

        if (roleData) {
            // Use upsert to ensure role exists for this user in this company
            await app_auth.userRoles().upsert({
                user_id: userId,
                role_id: roleData.id,
                company_id: tutorData.company_id,
                branch_id: tutorData.branch_id || null,
                is_active: true
            }, {
                onConflict: 'user_id,role_id,company_id,branch_id'
            });
        }

        // 4. Create Employee Record (Professional Record)
        const employeeCode = tutorData.employee_code || `TTR-${Math.floor(1000 + Math.random() * 9000)}`;

        const insertData: any = {
            company_id: tutorData.company_id,
            branch_id: tutorData.branch_id || null,
            user_id: userId,
            employee_code: employeeCode,
            first_name: tutorData.first_name,
            last_name: tutorData.last_name,
            middle_name: tutorData.middle_name || null,
            email: tutorData.email.toLowerCase(),
            phone: tutorData.phone,
            gender: tutorData.gender || 'Other',
            date_of_birth: tutorData.date_of_birth || null,
            date_of_joining: new Date().toISOString().split('T')[0],
            employment_type: tutorData.employment_type || 'FULL_TIME',
            department_id: dept?.id || null,
            designation_id: desig?.id || null,
            is_active: true,
            reporting_manager_id: tutorData.reporting_manager_id || null
        };

        const { data: employee, error: empError } = await core.employees()
            .insert(insertData)
            .select()
            .single();

        if (empError) {
            console.error('❌ [TutorService] Error creating employee:', empError);
            throw new Error(`Database Error: ${empError.message}`);
        }

        return employee as Tutor;
    }

    /**
     * Get a single tutor by ID
     */
    static async getTutorById(tutorId: number, companyId: number) {
        const { core } = require('@/lib/supabase');
        const { data, error } = await core.employees()
            .select('*')
            .eq('id', tutorId)
            .eq('company_id', companyId)
            .is('deleted_at', null)
            .single();

        if (error) throw error;
        return data as Tutor;
    }

    /**
     * Update tutor information
     */
    static async updateTutor(tutorId: number, updates: any, companyId: number) {
        const { core } = require('@/lib/supabase');

        // Ensure we're only updating the tutor for the correct company
        const { data, error } = await core.employees()
            .update({
                ...updates,
                updated_at: new Date().toISOString()
            })
            .eq('id', tutorId)
            .eq('company_id', companyId)
            .select()
            .single();

        if (error) throw error;
        return data as Tutor;
    }

    /**
     * Get employees who are NOT yet tutors (candidates)
     */
    static async getPotentialTutors(companyId: number) {
        const { core, app_auth } = require('@/lib/supabase');

        // 1. Get Role IDs
        const { data: roles } = await app_auth.roles()
            .select('id, name')
            .in('name', ['TUTOR', 'ACADEMIC_MANAGER']);

        const roleIds = roles?.map((r: any) => r.id) || [];

        // 2. Get User IDs that ALREADY have these roles
        const { data: existingTutors } = await app_auth.userRoles()
            .select('user_id')
            .eq('company_id', companyId)
            .in('role_id', roleIds)
            // .is('deleted_at', null) // user_roles table may not have deleted_at
            ;

        const excludeUserIds = existingTutors?.map((ur: any) => ur.user_id) || [];

        // 3. Fetch employees who are NOT in the exclusion list
        // Note: This only fetches employees who HAVE a user_id (since we need to assign a role to a user)
        let query = core.employees()
            .select('id, first_name, last_name, employee_code, email, designation_id, department_id, user_id')
            .eq('company_id', companyId)
            .not('user_id', 'is', null) // Must have a user account
            .is('deleted_at', null);

        if (excludeUserIds.length > 0) {
            // Postgres NOT IN syntax for multiple values
            // Supabase client uses .not('column', 'in', array)
            query = query.not('user_id', 'in', `(${excludeUserIds.join(',')})`);
        }

        const { data, error } = await query;
        if (error) throw error;
        return data || [];
    }

    /**
     * Assign TUTOR role to an existing employee
     */
    static async assignTutorRole(companyId: number, employeeId: number) {
        const { core, app_auth } = require('@/lib/supabase');

        // 1. Get the employee to find user_id
        const { data: employee, error: empError } = await core.employees()
            .select('user_id')
            .eq('id', employeeId)
            .eq('company_id', companyId)
            .single();

        if (empError || !employee) throw new Error('Employee not found');
        if (!employee.user_id) throw new Error('Employee does not have a linked User account. Please link a user first.');

        // 2. Get TUTOR Role ID
        const { data: role } = await app_auth.roles()
            .select('id')
            .eq('name', 'TUTOR')
            .maybeSingle();

        if (!role) {
            // Try fetching "EMSTutor" or similar if name is different, but migration said 'TUTOR'
            // If not found, throw error
            throw new Error('System Role TUTOR not found');
        }

        // 3. Assign Role
        const { error: roleError } = await app_auth.userRoles().upsert({
            user_id: employee.user_id,
            role_id: role.id,
            company_id: companyId,
            is_active: true
        }, {
            onConflict: 'user_id,role_id,company_id,branch_id'
        });

        if (roleError) throw roleError;

        return { success: true };
    }
}
