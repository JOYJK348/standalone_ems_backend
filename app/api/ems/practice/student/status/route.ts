import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/errorHandler';
import { getUserIdFromToken } from '@/lib/jwt';
import { getUserTenantScope } from '@/middleware/tenantFilter';
import { requireMenuAccessAppRouter } from '@/lib/menuAccessAppRouter';
import { PracticeService } from '@/lib/services/PracticeService';
import { fromSchema } from '@/lib/supabase';

export async function GET(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse(null, 'Unauthorized', 401);

        const menuAccess = await requireMenuAccessAppRouter(req, 'ems.practice.status');
        if (menuAccess instanceof Response) return menuAccess;

        const scope = await getUserTenantScope(userId);

        const { data: student } = await fromSchema('ems', 'students')
            .select('id')
            .eq('user_id', userId)
            .single();

        if (!student) return errorResponse(null, 'Student record not found', 404);

        const status = await PracticeService.getStudentStatus(student.id, scope.companyId!);

        return successResponse(status, 'Student practice status fetched');

    } catch (error: any) {
        return errorResponse(null, error.message || 'Failed to fetch status');
    }
}
