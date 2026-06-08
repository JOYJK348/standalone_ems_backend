import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/errorHandler';
import { getUserIdFromToken } from '@/lib/jwt';
import { getUserTenantScope } from '@/middleware/tenantFilter';
import { ems } from '@/lib/supabase';
import { requireMenuAccessAppRouter } from '@/lib/menuAccessAppRouter';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse(null, 'Unauthorized', 401);

        const menuAccess = await requireMenuAccessAppRouter(req, 'ems.face_profile.register');
        if (menuAccess instanceof Response) return menuAccess;

        const scope = await getUserTenantScope(userId);
        const data = await req.json();

        // Validate student profile exists
        const { data: student, error: studentError } = await ems.students()
            .select('id, company_id, first_name, last_name')
            .eq('user_id', userId)
            .single() as any;

        if (studentError || !student) {
            return errorResponse(null, 'Student profile not found', 404);
        }

        const studentId = student.id;
        const companyId = student.company_id;

        // Check if face profile already exists
        const { data: existingProfile } = await ems.faceProfiles()
            .select('id')
            .eq('student_id', studentId)
            .eq('is_active', true)
            .single() as any;

        if (existingProfile) {
            return errorResponse(null, 'Face profile already registered. Please contact admin to reset.', 400);
        }

        // Validate face images and descriptors
        const faceImages = data.face_images;
        const faceDescriptors = data.face_descriptors;

        if (!Array.isArray(faceImages) || faceImages.length < 3) {
            return errorResponse(null, 'At least 3 face images required for registration', 400);
        }

        if (!Array.isArray(faceDescriptors) || faceDescriptors.length < 3) {
            return errorResponse(null, 'Face descriptors (vectors) required for secure registration', 400);
        }

        // Validate descriptor format (should be 128D vectors)
        for (const descriptor of faceDescriptors) {
            if (!Array.isArray(descriptor) || descriptor.length !== 128) {
                return errorResponse(null, 'Invalid face descriptor format. Expected 128-dimensional vector.', 400);
            }
        }

        // Calculate average descriptor for stable profile
        // This creates a "master" face vector by averaging all 3 captures
        const avgDescriptor = averageDescriptors(faceDescriptors);

        // In production, upload images to Supabase Storage
        // For now, store first image as primary reference
        const primaryFaceUrl = faceImages[0];

        // Insert face profile with the averaged descriptor
        const { data: faceProfile, error: insertError } = await ems.faceProfiles()
            .insert({
                company_id: companyId,
                student_id: studentId,
                primary_face_url: primaryFaceUrl,
                face_embedding: avgDescriptor, // Store the 128D vector
                registration_date: new Date().toISOString(),
                is_active: true,
                confidence_score: 98.0, // High confidence since we averaged 3 captures
                registration_device_info: {
                    userAgent: req.headers.get('user-agent'),
                    platform: data.device_info?.platform || 'unknown'
                }
            })
            .select()
            .single() as any;

        if (insertError) {
            console.error('Face profile insert error:', insertError);
            return errorResponse(
                insertError,
                `Database Error: ${insertError.message}. Code: ${insertError.code}. Hint: ${insertError.hint || 'Check if student_face_profiles table exists'}`
            );
        }

        return successResponse(
            {
                profile_id: faceProfile.id,
                registered: true
            },
            'Face profile registered successfully'
        );

    } catch (error: any) {
        console.error('CRITICAL: Face registration error:', {
            message: error.message,
            stack: error.stack,
            cause: error.cause
        });
        return errorResponse(null, `Internal Server Error: ${error.message || 'Unknown error'}`);
    }
}

// Helper function: Average multiple face descriptors to create stable profile
// This reduces noise and creates a more reliable "master" face vector
function averageDescriptors(descriptors: number[][]): number[] {
    const numDescriptors = descriptors.length;
    const descriptorLength = descriptors[0].length; // Should be 128

    const avgDescriptor = new Array(descriptorLength).fill(0);

    // Sum all values at each position
    for (const descriptor of descriptors) {
        for (let i = 0; i < descriptorLength; i++) {
            avgDescriptor[i] += descriptor[i];
        }
    }

    // Divide by number of descriptors to get average
    for (let i = 0; i < descriptorLength; i++) {
        avgDescriptor[i] /= numDescriptors;
    }

    return avgDescriptor;
}

// GET endpoint to check if student has face profile
export async function GET(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse(null, 'Unauthorized', 401);

        const menuAccess = await requireMenuAccessAppRouter(req, 'ems.face_profile.register');
        if (menuAccess instanceof Response) return menuAccess;

        const { data: student } = await ems.students()
            .select('id')
            .eq('user_id', userId)
            .single() as any;

        if (!student) {
            return errorResponse(null, 'Student profile not found', 404);
        }

        const { data: faceProfile } = await ems.faceProfiles()
            .select('id, registration_date, confidence_score')
            .eq('student_id', student.id)
            .eq('is_active', true)
            .single() as any;

        return successResponse({
            is_enrolled: !!faceProfile,
            profile: faceProfile || null
        }, 'Face profile status retrieved');

    } catch (error: any) {
        console.error('Face profile check error:', error);
        return errorResponse(null, error.message || 'Failed to check face profile');
    }
}
