import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/errorHandler';
import { getUserTenantScope, autoAssignCompany } from '@/middleware/tenantFilter';
import { getUserIdFromToken } from '@/lib/jwt';
import { studentSchema } from '@/lib/validations/ems';
import { StudentService } from '@/lib/services/StudentService';
import { app_auth } from '@/lib/supabase';
import bcrypt from 'bcryptjs';
import { requireMenuAccessAppRouter } from '@/lib/menuAccessAppRouter';

export async function GET(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse(null, 'Unauthorized', 401);

        const menuAccess = await requireMenuAccessAppRouter(req, 'ems.students');
        if (menuAccess instanceof Response) return menuAccess;

        const scope = await getUserTenantScope(userId);

        const { searchParams } = new URL(req.url);
        const courseId = searchParams.get('course_id');

        const data = await StudentService.getAllStudents(
            scope.companyId!,
            courseId ? parseInt(courseId) : undefined
        );

        return successResponse(data, `Students fetched successfully (${data?.length || 0} records)`);

    } catch (error: any) {
        return errorResponse(null, error.message || 'Failed to fetch students');
    }
}

export async function POST(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse(null, 'Unauthorized', 401);

        const menuAccess = await requireMenuAccessAppRouter(req, 'ems.students');
        if (menuAccess instanceof Response) return menuAccess;

        let data = await req.json();

        // 1. Auto-assign company_id and branch_id based on user session
        data = await autoAssignCompany(userId, data);

        // 2. Validate input using Zod
        const validatedData = studentSchema.parse(data);

        // 3. Create Student with Auth using Service
        const student = await StudentService.createStudentWithAuth({
            ...validatedData,
            password: (data as any).password || 'Student@123'
        });

        return successResponse(
            {
                ...student,
                login_credentials: {
                    email: validatedData.email,
                    password: (data as any).password || 'Student@123',
                    student_code: validatedData.student_code
                }
            },
            `Student admitted successfully! Login Email: ${validatedData.email} | Password: ${(data as any).password || 'Student@123'}`,
            201
        );

    } catch (error: any) {
        console.error("Student Creation Error:", error);
        if (error.name === 'ZodError') {
            return errorResponse(error.errors, 'Validation failed', 400);
        }
        return errorResponse(null, error.message || 'Failed to admit student');
    }
}
