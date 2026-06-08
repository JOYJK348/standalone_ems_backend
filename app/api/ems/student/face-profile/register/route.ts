/**
 * Student Face Profile Registration API
 * POST /api/ems/student/face-profile/register
 */

import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/errorHandler';
import { getUserIdFromToken } from '@/lib/jwt';
import { AttendanceService } from '@/lib/services/AttendanceService';
import { ems } from '@/lib/supabase';
import { requireMenuAccessAppRouter } from '@/lib/menuAccessAppRouter';

export async function POST(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse(null, 'Unauthorized', 401);

        const menuAccess = await requireMenuAccessAppRouter(req, 'ems.face_profile.register');
        if (menuAccess instanceof Response) return menuAccess;

        const body = await req.json();
        const { faceImageUrl, qualityScore, faceEmbedding } = body;

        if (!faceImageUrl || !faceEmbedding) {
            return errorResponse(null, 'Image and face signature (embedding) are required', 400);
        }

        // Get student ID and company ID from user ID
        const { data: student, error: studentError } = await ems.students()
            .select('id, company_id')
            .eq('user_id', userId)
            .single();

        if (studentError || !student) {
            return errorResponse(null, 'Student record not found', 404);
        }

        // Register face profile using AttendanceService
        const result = await AttendanceService.registerFaceProfile(
            student.company_id,
            student.id,
            faceImageUrl,
            faceEmbedding,
            qualityScore || 95
        );

        return successResponse(result, 'Face profile registered successfully');
    } catch (error: any) {
        console.error('Face registration error:', error);
        return errorResponse(error, error.message || 'Failed to register face profile');
    }
}
