/**
 * Student Face Profile API Routes
 * Handles face registration and profile management
 */

import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/errorHandler';
import { getUserIdFromToken } from '@/lib/jwt';
import { ems } from '@/lib/supabase';
import { requireMenuAccessAppRouter } from '@/lib/menuAccessAppRouter';

// GET: Check if student has face profile
export async function GET(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse(null, 'Unauthorized', 401);

        const menuAccess = await requireMenuAccessAppRouter(req, 'ems.face_profile');
        if (menuAccess instanceof Response) return menuAccess;

        // Get student ID from user ID
        const { data: student } = await ems.students()
            .select('id, company_id')
            .eq('user_id', userId)
            .single();

        if (!student) {
            return errorResponse(null, 'Student record not found', 404);
        }

        // Check for existing face profile
        const { data: profile, error } = await ems.faceProfiles()
            .select('*')
            .eq('student_id', student.id)
            .eq('company_id', student.company_id)
            .single();

        if (error && error.code !== 'PGRST116') {
            throw error;
        }

        return successResponse(profile || null, 'Face profile retrieved');
    } catch (error: any) {
        console.error('Face profile check error:', error);
        return errorResponse(error, 'Failed to check face profile');
    }
}

// POST: Register face profile
export async function POST(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse(null, 'Unauthorized', 401);

        const menuAccess = await requireMenuAccessAppRouter(req, 'ems.face_profile');
        if (menuAccess instanceof Response) return menuAccess;

        const body = await req.json();
        const { faceImageUrl, faceEmbedding, qualityScore, deviceInfo } = body;

        if (!faceImageUrl || !faceEmbedding) {
            return errorResponse(null, 'Face data is required', 400);
        }

        // Get student ID from user ID
        const { data: student } = await ems.students()
            .select('id, company_id')
            .eq('user_id', userId)
            .single();

        if (!student) {
            return errorResponse(null, 'Student record not found', 404);
        }

        // Check if profile already exists
        const { data: existingProfile } = await ems.faceProfiles()
            .select('id')
            .eq('student_id', student.id)
            .eq('company_id', student.company_id)
            .single();

        let result;
        if (existingProfile) {
            // Update existing profile
            const { data, error } = await ems.faceProfiles()
                .update({
                    primary_face_url: faceImageUrl,
                    face_embedding: faceEmbedding,
                    quality_score: qualityScore || 95,
                    registration_device_info: deviceInfo,
                    is_active: true,
                    updated_at: new Date().toISOString()
                } as any)
                .eq('id', existingProfile.id)
                .select()
                .single();

            if (error) throw error;
            result = data;
        } else {
            // Create new profile
            const { data, error } = await ems.faceProfiles()
                .insert({
                    company_id: student.company_id,
                    student_id: student.id,
                    primary_face_url: faceImageUrl,
                    face_embedding: faceEmbedding,
                    quality_score: qualityScore || 95,
                    registration_device_info: deviceInfo,
                    is_active: true
                } as any)
                .select()
                .single();

            if (error) throw error;
            result = data;
        }

        return successResponse(result, 'Face profile registered successfully');
    } catch (error: any) {
        console.error('Face registration error:', error);
        return errorResponse(error, 'Failed to register face profile');
    }
}
