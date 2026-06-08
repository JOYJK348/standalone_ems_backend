/**
 * EMS Attendance Verification API
 * POST /api/ems/attendance/verify
 */

import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/errorHandler';
import { getUserIdFromToken } from '@/lib/jwt';
import { AttendanceService } from '@/lib/services/AttendanceService';
import { ems } from '@/lib/supabase';
import { getUserTenantScope } from '@/middleware/tenantFilter';
import { requireMenuAccessAppRouter } from '@/lib/menuAccessAppRouter';

export async function POST(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse(null, 'Unauthorized', 401);
        const menuAccess = await requireMenuAccessAppRouter(req, 'ems.attendance.verify');
        if (menuAccess instanceof Response) return menuAccess;

        const scope = await getUserTenantScope(userId);
        const body = await req.json();

        // 1. Get student ID from user session
        const { data: student, error: studentError } = await ems.students()
            .select('id')
            .eq('user_id', userId)
            .single();

        if (studentError || !student) {
            return errorResponse(null, 'Student record not found', 404);
        }

        // 2. Submit for verification (Location + Biometric Match)
        const result = await AttendanceService.submitFaceVerification(
            {
                sessionId: body.sessionId,
                studentId: student.id,
                verificationType: body.verificationType || 'OPENING',
                faceImageUrl: body.faceImageUrl,
                faceDescriptor: body.faceEmbedding,
                latitude: body.latitude,
                longitude: body.longitude,
                locationAccuracy: body.locationAccuracy || 10,
                deviceInfo: body.deviceInfo || {},
                ipAddress: req.headers.get('x-Agaran-client-ip') || '0.0.0.0',
                userAgent: req.headers.get('user-agent') || ''
            },
            scope.companyId!
        );

        if (!result.success) {
            return errorResponse(null, result.error || 'Verification failed', 400);
        }

        return successResponse(result, 'Attendance verified and marked successfully');

    } catch (error: any) {
        console.error('Attendance verification error:', error);
        return errorResponse(error, error.message || 'Verification system error');
    }
}
