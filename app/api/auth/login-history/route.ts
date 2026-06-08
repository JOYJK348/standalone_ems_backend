import { NextRequest } from 'next/server';
import { supabaseService } from '@/lib/supabase';
import { SCHEMAS } from '@/config/constants';
import { successResponse, errorResponse } from '@/lib/errorHandler';

/**
 * AUTH: Login History API
 * Route: /api/auth/login-history
 */
export async function GET(_req: NextRequest) {
    try {
        const { data, error } = await supabaseService
            .schema(SCHEMAS.AUTH)
            .from('login_history')
            .select(`
                *,
                user:users(email, first_name, last_name)
            `)
            .order('logged_in_at', { ascending: false });

        if (error) throw new Error(error.message);
        return successResponse(data, 'Login history fetched successfully');
    } catch (error: any) {
        return errorResponse('FETCH_ERROR', error.message || 'Failed to fetch login history');
    }
}
