import { NextRequest } from 'next/server';
import { supabaseService } from '@/lib/supabase';
import { SCHEMAS } from '@/config/constants';
import { getUserIdFromToken } from '@/lib/jwt';
import { getUserTenantScope } from '@/middleware/tenantFilter';
import { successResponse, errorResponse } from '@/lib/errorHandler';
import { dataCache } from '@/lib/cache/dataCache';

const CACHE_TTL = 15 * 1000;

export async function GET(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse('UNAUTHORIZED', 'Authentication required', 401);

        const cacheKey = `ems_notifications:${userId}`;
        const cached = await dataCache.get(cacheKey);
        if (cached) return successResponse(cached, 'Notifications fetched (cached)');

        const scope = await getUserTenantScope(userId);

        let query = supabaseService
            .schema(SCHEMAS.EMS)
            .from('notifications')
            .select('*')
            .or(`recipient_user_id.eq.${userId},user_id.eq.${userId}`)
            .order('created_at', { ascending: false })
            .limit(100);

        if (scope.companyId && scope.roleLevel < 5) {
            query = query.eq('company_id', scope.companyId);
        }

        const { data, error } = await query;

        if (error) throw error;

        const processed = (data || []).map(n => ({
            ...n,
            type: n.notification_type || 'INFO',
            notification_type: n.notification_type || 'INFO'
        }));

        await dataCache.set(cacheKey, processed, CACHE_TTL);
        return successResponse(processed);
    } catch (err: any) {
        console.error(`[NOTIFICATIONS] Exception:`, err);
        return errorResponse('INTERNAL_SERVER_ERROR', err.message, 500);
    }
}

export async function POST(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse('UNAUTHORIZED', 'Authentication required', 401);

        const scope = await getUserTenantScope(userId);
        const body = await req.json();

        const { recipient_user_id, company_id, title, message, notification_type, priority, link_url, reference_type, reference_id, metadata } = body;

        if (!title) return errorResponse('VALIDATION_ERROR', 'Title is required', 400);

        const notificationData: Record<string, any> = {
            user_id: userId,
            company_id: company_id || scope.companyId,
            title,
            message: message || '',
            notification_type: notification_type || 'INFO',
            priority: priority || 'MEDIUM',
            is_read: false,
            created_at: new Date().toISOString()
        };

        if (recipient_user_id) notificationData.recipient_user_id = recipient_user_id;
        if (link_url) notificationData.link_url = link_url;
        if (reference_type) notificationData.reference_type = reference_type;
        if (reference_id) notificationData.reference_id = reference_id;
        if (metadata) notificationData.metadata = metadata;

        const { data, error } = await supabaseService
            .schema(SCHEMAS.EMS)
            .from('notifications')
            .insert([notificationData])
            .select()
            .single();

        if (error) return errorResponse('DATABASE_ERROR', error.message, 500);
        return successResponse(data, 'Notification sent successfully');

    } catch (err: any) {
        return errorResponse('INTERNAL_SERVER_ERROR', err.message, 500);
    }
}

export async function PATCH(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse('UNAUTHORIZED', 'Authentication required', 401);

        const { ids, all } = await req.json();

        let query = supabaseService
            .schema(SCHEMAS.EMS)
            .from('notifications')
            .update({ is_read: true, read_at: new Date().toISOString() });

        if (all) {
            query = query.or(`recipient_user_id.eq.${userId},user_id.eq.${userId}`);
        } else if (ids && Array.isArray(ids)) {
            query = query.in('id', ids).or(`recipient_user_id.eq.${userId},user_id.eq.${userId}`);
        } else {
            return errorResponse('VALIDATION_ERROR', 'Notification IDs are required', 400);
        }

        const { error } = await query;
        if (error) return errorResponse('DATABASE_ERROR', error.message, 500);

        return successResponse({ message: 'Notifications marked as read' });
    } catch (err: any) {
        return errorResponse('INTERNAL_SERVER_ERROR', err.message, 500);
    }
}
