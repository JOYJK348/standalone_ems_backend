/**
 * CORE API - Companies (Platform Admin Only)
 * Route: /api/core/companies
 */

import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/errorHandler';
import { core } from '@/lib/supabase';
import { getUserTenantScope } from '@/middleware/tenantFilter';
import { getUserIdFromToken } from '@/lib/jwt';
import { AuditService } from '@/lib/services/AuditService';

export async function GET(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse('UNAUTHORIZED', 'Unauthorized', 401);

        const scope = await getUserTenantScope(userId);

        let query = core.companies().select('*');

        if (scope.roleLevel < 5) {
            query = query.eq('id', scope.companyId).eq('is_active', true);
        }

        query = query.order('name');

        const { data, error } = await query;

        if (error) {
            console.error('[API COMPANIES] Database error:', error);
            throw new Error(error.message);
        }

        console.log(`[API COMPANIES] Found ${data?.length || 0} companies for user ${userId}`);

        // 🛡️ High-Verbosity Audit (Tracks listing of companies)
        await AuditService.logAction({
            userId,
            action: 'LIST',
            tableName: 'companies',
            schemaName: 'core',
            ipAddress: AuditService.getIP(req),
        });

        return successResponse(data || [], `Companies fetched successfully (${data?.length || 0} records)`);

    } catch (error: any) {
        return errorResponse('INTERNAL_ERROR', error.message || 'Failed to fetch companies');
    }
}

export async function POST(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse('UNAUTHORIZED', 'Unauthorized', 401);

        const scope = await getUserTenantScope(userId);

        // Only Platform Admin can create companies
        if (scope.roleLevel < 5) {
            return errorResponse('FORBIDDEN', 'Permission Denied: Only Platform Admin can create companies', 403);
        }

        const data = await req.json();

        if (!data.name || !data.code) {
            return errorResponse('VALIDATION_ERROR', 'name and code are required', 400);
        }

        const { data: company, error } = await core.companies()
            .insert(data)
            .select()
            .single();

        if (error) {
            console.error('[API COMPANIES] Create error:', error);
            throw new Error(error.message);
        }

        // Audit Log (Triggers Notification)
        await AuditService.logAction({
            userId,
            action: 'CREATE',
            tableName: 'companies',
            recordId: company.id,
            newData: company,
            companyId: company.id, // The company itself
            userEmail: 'platform-admin', // Placeholder until user fetch is added
            ipAddress: AuditService.getIP(req),
        });

        return successResponse(company, 'Company created successfully', 201);

    } catch (error: any) {
        return errorResponse('INTERNAL_ERROR', error.message || 'Failed to create company');
    }
}
