/**
 * EMS API - Update Live Class Status
 * Route: /api/ems/live-classes/[id]/status
 */

import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/errorHandler';
import { getUserIdFromToken } from '@/lib/jwt';
import { getUserTenantScope } from '@/middleware/tenantFilter';
import { ems } from '@/lib/supabase';
import { AttendanceService } from '@/lib/services/AttendanceService';
import { requireMenuAccessAppRouter } from '@/lib/menuAccessAppRouter';

export async function PATCH(
    req: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse(null, 'Unauthorized', 401);
        const menuAccess = await requireMenuAccessAppRouter(req, 'ems.live_classes.status');
        if (menuAccess instanceof Response) return menuAccess;

        const { id } = await context.params;
        const classId = parseInt(id);
        const scope = await getUserTenantScope(userId);
        const { status, recording_url } = await req.json();

        if (!status) {
            return errorResponse(null, 'Status is required', 400);
        }

        const updateData: any = {
            class_status: status,
            updated_at: new Date().toISOString()
        };

        if (recording_url) {
            updateData.recording_url = recording_url;
        }

        const { data, error } = await ems.liveClasses()
            .update(updateData)
            .eq('id', classId)
            .eq('company_id', scope.companyId!)
            .select()
            .single();

        if (error) throw error;

        // AUTOMATION: If class is COMPLETED, trigger Exit Attendance window for students
        if (status === 'COMPLETED' && data.batch_id) {
            try {
                // Find existing session for today for this batch
                const today = new Date().toISOString().split('T')[0];
                const { data: session } = await ems.attendanceSessions()
                    .select('id')
                    .eq('batch_id', data.batch_id)
                    .eq('session_date', today)
                    .maybeSingle();

                if (session) {
                    await AttendanceService.updateSessionStatus(scope.companyId!, session.id, 'IDENTIFYING_EXIT');
                    console.log(`[Automation] Triggered Exit Attendance for batch ${data.batch_id}`);
                }
            } catch (autoErr) {
                console.error('[Automation Error] Failed to trigger Exit Attendance:', autoErr);
            }
        }

        // 🔔 AUTOMATION: Trigger notifications for status changes (LIVE, COMPLETED)
        const { EMSNotificationTriggers } = require('@/lib/services/EMSNotificationTriggers');
        EMSNotificationTriggers.onClassStatusChanged(classId, status, scope.companyId!).catch(console.error);

        // Map back for response
        const responseData = {
            ...data,
            status: data.class_status || data.status,
            external_link: data.meeting_link || data.external_link
        };

        return successResponse(responseData, `Class status updated to ${status}`);

    } catch (error: any) {
        console.error('[Live Class Status] Error:', error);
        return errorResponse(null, error.message || 'Failed to update status');
    }
}
