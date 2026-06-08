
import { NextRequest } from 'next/server';
import { core } from '@/lib/supabase';
import { getUserIdFromToken } from '@/lib/jwt';
import { getUserTenantScope } from '@/middleware/tenantFilter';
import { successResponse, errorResponse } from '@/lib/errorHandler';

export async function GET(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse('UNAUTHORIZED', 'Unauthorized', 401);

        const scope = await getUserTenantScope(userId);
        let companyId = scope.companyId;

        // Platform Admin can specify companyId via query param
        if (scope.roleLevel >= 5) {
            const url = new URL(req.url);
            const paramId = url.searchParams.get('companyId');
            if (paramId) companyId = parseInt(paramId, 10);
        }

        if (!companyId) {
            return errorResponse('BAD_REQUEST', 'Company ID is required (specify via query param for Platform Admins)', 400);
        }

        // Get the latest employee code
        // We look for codes matching specific pattern or just sort by ID desc
        // Assuming 'EMP001' format or similar
        const { data: lastEmployee } = await core.employees()
            .select('employee_code')
            .eq('company_id', companyId)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        let nextCode = 'EMP001';

        if (lastEmployee?.employee_code) {
            const match = lastEmployee.employee_code.match(/([a-zA-Z]+)(\d+)/);
            if (match) {
                const prefix = match[1];
                const num = parseInt(match[2], 10);
                const newNum = num + 1;
                // Pad with zeros to maintain length (Assuming 3 digits)
                const paddedNum = newNum.toString().padStart(match[2].length, '0');
                nextCode = `${prefix}${paddedNum}`;
            } else {
                // Fallback if pattern doesn't match
                nextCode = `${lastEmployee.employee_code}-1`;
            }
        }

        return successResponse({ code: nextCode }, 'Next employee code generated');

    } catch (error: any) {
        return errorResponse('INTERNAL_ERROR', error.message, 500);
    }
}
