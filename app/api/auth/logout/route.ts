import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/errorHandler';
import { app_auth } from '@/lib/supabase';
import { invalidateUserCaches } from '@/lib/redis';
import { AuditService } from '@/lib/services/AuditService';

/**
 * AUTH: Logout API
 * Invalidates user session and logs out
 */
export async function POST(req: NextRequest) {
    try {
        const userId = req.headers.get('x-user-id');
        const ipAddress = AuditService.getIP(req);
        const userAgent = req.headers.get('user-agent') || 'unknown';
        if (userId) {
            const uid = parseInt(userId);

            // 0. Fetch user email for audit log
            const { data: user } = await app_auth.users()
                .select('email, user_roles(company_id)')
                .eq('id', uid)
                .single();

            const companyId = (user as any)?.user_roles?.[0]?.company_id;

            // 1. Invalidate Redis Caches
            await invalidateUserCaches(uid);

            // 2. Log Action
            await AuditService.logAction({
                userId: uid,
                userEmail: user?.email,
                action: 'LOGOUT',
                tableName: 'users',
                schemaName: 'app_auth',
                recordId: userId,
                ipAddress,
                userAgent,
                companyId: companyId
            });
        }

        return successResponse({}, 'Logout successful');
    } catch (error) {
        console.error('Logout error:', error);
        return errorResponse('INTERNAL_SERVER_ERROR', 'Failed to logout', 500);
    }
}
