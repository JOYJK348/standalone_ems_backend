/**
 * EMS API - Attendance Marking
 * Route: /api/ems/attendance/mark
 */

import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/errorHandler';
import { getUserIdFromToken } from '@/lib/jwt';
import { getUserTenantScope } from '@/middleware/tenantFilter';
import { ems } from '@/lib/supabase';
import { AttendanceService } from '@/lib/services/AttendanceService';
import { requireMenuAccessAppRouter } from '@/lib/menuAccessAppRouter';

export async function POST(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse(null, 'Unauthorized', 401);
        const menuAccess = await requireMenuAccessAppRouter(req, 'ems.attendance.mark');
        if (menuAccess instanceof Response) return menuAccess;

        const scope = await getUserTenantScope(userId);
        const { classId, type, lat, long, faceUrl, faceScore } = await req.json();

        // 1. Fetch Class Details
        const { data: liveClass, error: classError } = await ems.liveClasses()
            .select('*')
            .eq('id', classId)
            .single();

        if (classError || !liveClass) return errorResponse(null, 'Class session not found', 404);

        // 2. Window Validation (Server Side)
        const windowCheck = AttendanceService.isInsideWindow(
            new Date(`${liveClass.scheduled_date}T${liveClass.start_time}`),
            new Date(`${liveClass.scheduled_date}T${liveClass.end_time}`),
            type
        );

        if (!windowCheck.isValid) {
            return errorResponse(null, windowCheck.message, 400);
        }

        // 3. Check if Record Exists
        const { data: existingRecord } = await ems.attendanceRecords()
            .select('id, status')
            .eq('session_id', classId)
            .eq('student_id', userId)
            .single();

        let updateData: any = {
            status: type === 'IN' ? 'PRESENT' : 'PRESENT'
        };

        const { data, error } = await ems.attendanceRecords()
            .upsert({
                id: existingRecord?.id,
                company_id: scope.companyId,
                session_id: classId,
                student_id: userId,
                ...updateData
            })
            .select()
            .single();

        if (error) throw error;

        return successResponse(data, `Attendance marked for Check-${type}`);

    } catch (error: any) {
        console.error('[Attendance Mark] Error:', error);
        return errorResponse(null, error.message || 'Failed to mark attendance');
    }
}
