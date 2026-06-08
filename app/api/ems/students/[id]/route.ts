import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/errorHandler';
import { getUserTenantScope } from '@/middleware/tenantFilter';
import { getUserIdFromToken } from '@/lib/jwt';
import { studentSchema } from '@/lib/validations/ems';
import { StudentService } from '@/lib/services/StudentService';
import { requireMenuAccessAppRouter } from '@/lib/menuAccessAppRouter';
import { dataCache } from '@/lib/cache/dataCache';

const CACHE_TTL = 60 * 1000;

/**
 * GET /api/ems/students/[id]
 * Fetch single student by ID
 */
export async function GET(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse(null, 'Unauthorized', 401);

        const menuAccess = await requireMenuAccessAppRouter(req, 'ems.students.edit');
        if (menuAccess instanceof Response) return menuAccess;

        const scope = await getUserTenantScope(userId);
        const studentId = parseInt(params.id);

        const cacheKey = `ems_student:${studentId}:${scope.companyId}`;
        const cached = await dataCache.get(cacheKey);
        if (cached) return successResponse(cached, 'Student fetched successfully (cached)');

        const student = await StudentService.getStudentById(studentId, scope.companyId!);

        if (!student) {
            return errorResponse(null, 'Student not found', 404);
        }

        await dataCache.set(cacheKey, student, CACHE_TTL);
        return successResponse(student, 'Student fetched successfully');

    } catch (error: any) {
        return errorResponse(null, error.message || 'Failed to fetch student');
    }
}

/**
 * PUT /api/ems/students/[id]
 * Update student details
 */
export async function PUT(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse(null, 'Unauthorized', 401);

        const menuAccess = await requireMenuAccessAppRouter(req, 'ems.students.edit');
        if (menuAccess instanceof Response) return menuAccess;

        const scope = await getUserTenantScope(userId);
        const studentId = parseInt(params.id);
        const data = await req.json();

        // Validate input
        const validatedData = studentSchema.partial().parse(data);

        // Update student
        const updatedStudent = await StudentService.updateStudent(
            studentId,
            scope.companyId!,
            validatedData
        );

        if (!updatedStudent) {
            return errorResponse(null, 'Student not found or update failed', 404);
        }

        return successResponse(updatedStudent, 'Student updated successfully');

    } catch (error: any) {
        console.error("Student Update Error:", error);
        if (error.name === 'ZodError') {
            return errorResponse(error.errors, 'Validation failed', 400);
        }
        return errorResponse(null, error.message || 'Failed to update student');
    }
}

/**
 * DELETE /api/ems/students/[id]
 * Soft delete student (sets deleted_at timestamp)
 */
export async function DELETE(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse(null, 'Unauthorized', 401);

        const menuAccess = await requireMenuAccessAppRouter(req, 'ems.students.edit');
        if (menuAccess instanceof Response) return menuAccess;

        const scope = await getUserTenantScope(userId);
        const studentId = parseInt(params.id);

        // Soft delete
        const deleted = await StudentService.deleteStudent(studentId, scope.companyId!, userId);

        if (!deleted) {
            return errorResponse(null, 'Student not found or already deleted', 404);
        }

        return successResponse(
            { id: studentId, deleted: true },
            'Student removed successfully'
        );

    } catch (error: any) {
        return errorResponse(null, error.message || 'Failed to delete student');
    }
}
