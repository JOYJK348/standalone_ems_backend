import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/errorHandler';
import { getUserIdFromToken } from '@/lib/jwt';
import { app_auth } from '@/lib/supabase';
import { AuditService } from '@/lib/services/AuditService';

/**
 * PATCH /api/auth/me/profile - Update current user profile
 */
export async function PATCH(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse('UNAUTHORIZED', 'Unauthorized', 401);

        const body = await req.json();
        const { display_name, first_name, last_name, phone_number, timezone, avatar_url } = body;

        // Get current user data for audit
        const { data: currentUser } = await app_auth.users()
            .select('display_name, first_name, last_name, phone, avatar_url')
            .eq('id', userId)
            .single();

        // Build update object with only provided fields
        const updateData: Record<string, any> = {};
        if (display_name !== undefined) updateData.display_name = display_name;
        if (first_name !== undefined) updateData.first_name = first_name;
        if (last_name !== undefined) updateData.last_name = last_name;
        if (phone_number !== undefined) updateData.phone = phone_number;
        if (timezone !== undefined) updateData.timezone = timezone;
        if (avatar_url !== undefined) updateData.avatar_url = avatar_url;

        // Add updater info
        updateData.updated_by = userId;
        updateData.updated_at = new Date().toISOString();

        if (Object.keys(updateData).length === 2) {
            // Only updated_at and updated_by, no actual changes
            return errorResponse('BAD_REQUEST', 'No fields to update', 400);
        }

        // Update user profile
        const { data: updatedUser, error } = await app_auth.users()
            .update(updateData)
            .eq('id', userId)
            .select('id, email, display_name, first_name, last_name, phone, avatar_url, timezone')
            .single();

        if (error) {
            console.error('[Profile Update] DB Error:', error);
            return errorResponse('DATABASE_ERROR', error.message, 500);
        }

        // Log activity
        const ipAddress = AuditService.getIP(req);
        const userAgent = req.headers.get('user-agent') || 'unknown';

        await AuditService.logAction({
            userId,
            action: 'PROFILE_UPDATE',
            tableName: 'users',
            schemaName: 'app_auth',
            recordId: String(userId),
            oldData: currentUser,
            newData: updateData,
            ipAddress,
            userAgent
        });

        return successResponse(updatedUser, 'Profile updated successfully');
    } catch (error: any) {
        console.error('[Profile Update] Error:', error);
        return errorResponse('INTERNAL_ERROR', error.message);
    }
}
