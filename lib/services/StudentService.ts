import { ems, app_auth } from '@/lib/supabase';
import { Student, StudentGuardian } from '@/types/database';
import bcrypt from 'bcryptjs';

/**
 * Service for Student-related database operations
 */
export class StudentService {
    /**
     * Creates a Student record along with a User account and STUDENT role.
     * This ensures the student can log in immediately.
     */
    static async createStudentWithAuth(studentData: any) {
        let userId: number;

        // 1. Check if user already exists by email
        const { data: existingUser } = await app_auth.users()
            .select('id')
            .eq('email', studentData.email!.toLowerCase())
            .maybeSingle();

        if (existingUser) {
            userId = existingUser.id;
            // Optionally update password if provided
            if (studentData.password) {
                const salt = await bcrypt.genSalt(10);
                const hashedPassword = await bcrypt.hash(studentData.password, salt);
                await app_auth.users().update({
                    password_hash: hashedPassword,
                    updated_at: new Date().toISOString()
                }).eq('id', userId);
            }
        } else {
            // 2. Create User Account
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(studentData.password || 'Student@123', salt);

            const { data: newUser, error: userError } = await app_auth.users()
                .insert({
                    email: studentData.email!.toLowerCase(),
                    password_hash: hashedPassword,
                    first_name: studentData.first_name,
                    last_name: studentData.last_name,
                    display_name: `${studentData.first_name} ${studentData.last_name}`,
                    is_active: true,
                    is_verified: true
                })
                .select('id')
                .single();

            if (userError) {
                console.error('❌ [StudentService] Error creating auth user:', userError);
                throw new Error(`Auth Account Error: ${userError.message}`);
            }
            userId = newUser.id;
        }

        // 3. Ensure STUDENT Role exists for this company/branch
        const { data: roleData } = await app_auth.roles()
            .select('id')
            .eq('name', 'STUDENT')
            .maybeSingle();

        if (roleData) {
            await app_auth.userRoles().upsert({
                user_id: userId,
                role_id: roleData.id,
                company_id: studentData.company_id,
                branch_id: studentData.branch_id || null,
                is_active: true
            }, {
                onConflict: 'user_id,role_id,company_id,branch_id'
            });
        }

        // 4. Create Student Record
        const { data: student, error: studentError } = await ems.students()
            .insert({
                company_id: studentData.company_id,
                branch_id: studentData.branch_id,
                user_id: userId,
                student_code: studentData.student_code,
                first_name: studentData.first_name,
                middle_name: studentData.middle_name,
                last_name: studentData.last_name,
                date_of_birth: studentData.date_of_birth,
                gender: studentData.gender,
                email: studentData.email!.toLowerCase(),
                phone: studentData.phone,
                address_line1: studentData.address_line1,
                address_line2: studentData.address_line2,
                city: studentData.city,
                state: studentData.state,
                country: studentData.country || 'India',
                postal_code: studentData.postal_code,
                is_active: true,
                status: 'ACTIVE'
            })
            .select()
            .single();

        if (studentError) {
            console.error('❌ [StudentService] Error creating student record:', studentError);
            throw new Error(`Student Record Error: ${studentError.message}`);
        }

        return student;
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 1. STUDENT MANAGEMENT
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    static async getAllStudents(companyId: number, courseId?: number) {
        let query = ems.students()
            .select('*')
            .eq('company_id', companyId)
            .is('deleted_at', null);

        if (courseId) {
            // Filter by enrollment in the course
            const { data: enrollments } = await ems.enrollments()
                .select('student_id')
                .eq('course_id', courseId)
                .is('deleted_at', null);

            const studentIds = enrollments?.map(e => e.student_id) || [];
            if (studentIds.length === 0) return [];
            query = query.in('id', studentIds);
        }

        const { data, error } = await query;
        if (error) throw error;
        return data as Student[];
    }

    static async getStudentById(id: number, companyId: number) {
        const { data, error } = await ems.students()
            .select('*, student_guardians(*)')
            .eq('id', id)
            .eq('company_id', companyId)
            .is('deleted_at', null)
            .single();

        if (error) throw error;
        return data as Student & { student_guardians: StudentGuardian[] };
    }

    static async getStudentByUserId(userId: number) {
        const { data, error } = await ems.students()
            .select('*')
            .eq('user_id', userId)
            .single();

        if (error) throw error;
        return data as Student;
    }

    static async createStudent(studentData: Partial<Student>) {
        const { data, error } = await ems.students()
            .insert(studentData)
            .select()
            .single();

        if (error) throw error;
        return data as Student;
    }

    static async updateStudent(id: number, companyId: number, studentData: Partial<Student>) {
        const { data, error } = await ems.students()
            .update(studentData)
            .eq('id', id)
            .eq('company_id', companyId)
            .is('deleted_at', null)
            .select()
            .single();

        if (error) throw error;
        return data as Student;
    }

    static async deleteStudent(id: number, companyId: number, deletedBy: number, reason?: string) {
        const { data, error } = await ems.students()
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

    static async softDeleteStudent(id: number, deletedBy: number, reason?: string) {
        const { data, error } = await ems.students()
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
    // 2. GUARDIAN MANAGEMENT
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    static async addGuardian(guardianData: Partial<StudentGuardian>) {
        const { data, error } = await ems.studentGuardians()
            .insert(guardianData)
            .select()
            .single();

        if (error) throw error;
        return data as StudentGuardian;
    }

    static async updateGuardian(id: number, guardianData: Partial<StudentGuardian>) {
        const { data, error } = await ems.studentGuardians()
            .update(guardianData)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return data as StudentGuardian;
    }
}
