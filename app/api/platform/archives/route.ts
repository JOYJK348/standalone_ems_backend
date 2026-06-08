/**
 * PLATFORM API - Archives & Recovery
 * Route: /api/platform/archives
 */

import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/errorHandler';
import { app_auth, core } from '@/lib/supabase';
import { getUserIdFromToken } from '@/lib/jwt';
import { getUserTenantScope } from '@/middleware/tenantFilter';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse('UNAUTHORIZED', 'Unauthorized', 401);

        const scope = await getUserTenantScope(userId);
        if (scope.roleLevel < 5) return errorResponse('FORBIDDEN', 'Forbidden: Platform Admin only', 403);

        const url = new URL(req.url);
        const type = url.searchParams.get('type') || 'all'; // 'users', 'employees', 'companies'

        const results = {
            users: [] as any[],
            employees: [] as any[],
            companies: [] as any[]
        };

        // Fetch Deleted Users
        if (type === 'all' || type === 'users') {
            const { data: users, error } = await app_auth.users()
                .select('id, email, first_name, last_name, display_name, deleted_at, deleted_by, delete_reason')
                .eq('is_active', false)
                .not('deleted_at', 'is', null)
                .order('deleted_at', { ascending: false });

            if (!error && users) results.users = users;
        }

        // Fetch Deleted Employees
        if (type === 'all' || type === 'employees') {
            const { data: employees, error } = await core.employees()
                .select('id, first_name, last_name, employee_code, email, deleted_at, deleted_by, delete_reason, company:companies(name)')
                .eq('is_active', false)
                .not('deleted_at', 'is', null)
                .order('deleted_at', { ascending: false });

            if (!error && employees) results.employees = employees;
        }

        // Fetch Deleted Companies
        if (type === 'all' || type === 'companies') {
            const { data: companies, error } = await core.companies()
                .select('id, name, code, email, deleted_at, deleted_by, delete_reason')
                .eq('is_active', false)
                .not('deleted_at', 'is', null)
                .order('deleted_at', { ascending: false });

            if (!error && companies) results.companies = companies;
        }

        return successResponse(results, 'Archives fetched successfully');

    } catch (error: any) {
        return errorResponse('INTERNAL_ERROR', error.message);
    }
}
