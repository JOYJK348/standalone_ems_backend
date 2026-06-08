import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/errorHandler';
import { getUserIdFromToken } from '@/lib/jwt';
import { ems } from '@/lib/supabase';
import { requireMenuAccessAppRouter } from '@/lib/menuAccessAppRouter';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse(null, 'Unauthorized', 401);

        const menuAccess = await requireMenuAccessAppRouter(req, 'ems.face_profile.verify');
        if (menuAccess instanceof Response) return menuAccess;

        const data = await req.json();
        const { face_image, face_descriptor } = data;

        if (!face_image) {
            return errorResponse(null, 'Face image required for verification', 400);
        }

        if (!face_descriptor || !Array.isArray(face_descriptor) || face_descriptor.length !== 128) {
            return errorResponse(null, 'Valid face descriptor (128D vector) required for verification', 400);
        }

        // Get student profile
        const { data: student } = await ems.students()
            .select('id, company_id, first_name, last_name')
            .eq('user_id', userId)
            .single() as any;

        if (!student) {
            return errorResponse(null, 'Student profile not found', 404);
        }

        // Get registered face profile
        const { data: faceProfile } = await ems.faceProfiles()
            .select('id, face_embedding, primary_face_url')
            .eq('student_id', student.id)
            .eq('is_active', true)
            .single() as any;

        if (!faceProfile) {
            return errorResponse(null, 'Face profile not registered. Please complete registration first.', 404);
        }

        // Calculate cosine similarity between stored and live descriptors
        const storedDescriptor = faceProfile.face_embedding as number[];
        const matchScore = cosineSimilarity(storedDescriptor, face_descriptor) * 100;

        const isMatch = matchScore >= 90; // 90% threshold for security

        if (!isMatch) {
            return successResponse({
                verified: false,
                match_score: Math.round(matchScore * 10) / 10,
                message: `Face verification failed. Match score: ${Math.round(matchScore)}% (Required: 90%)`
            }, 'Verification completed');
        }

        return successResponse({
            verified: true,
            match_score: Math.round(matchScore * 10) / 10,
            student_id: student.id,
            profile_id: faceProfile.id
        }, 'Face verified successfully');

    } catch (error: any) {
        console.error('Face verification error:', error);
        return errorResponse(null, error.message || 'Face verification failed');
    }
}

// Cosine Similarity: The mathematical heart of face verification
// Compares two 128D vectors and returns similarity score (0 to 1)
// Formula: cos(θ) = (A · B) / (||A|| × ||B||)
function cosineSimilarity(vectorA: number[], vectorB: number[]): number {
    if (vectorA.length !== vectorB.length) {
        throw new Error('Vectors must have same dimensions');
    }

    // Calculate dot product (A · B)
    let dotProduct = 0;
    for (let i = 0; i < vectorA.length; i++) {
        dotProduct += vectorA[i] * vectorB[i];
    }

    // Calculate magnitude of A (||A||)
    let magnitudeA = 0;
    for (let i = 0; i < vectorA.length; i++) {
        magnitudeA += vectorA[i] * vectorA[i];
    }
    magnitudeA = Math.sqrt(magnitudeA);

    // Calculate magnitude of B (||B||)
    let magnitudeB = 0;
    for (let i = 0; i < vectorB.length; i++) {
        magnitudeB += vectorB[i] * vectorB[i];
    }
    magnitudeB = Math.sqrt(magnitudeB);

    // Return cosine similarity
    // Returns value between 0 (completely different) and 1 (identical)
    if (magnitudeA === 0 || magnitudeB === 0) {
        return 0;
    }

    return dotProduct / (magnitudeA * magnitudeB);
}
