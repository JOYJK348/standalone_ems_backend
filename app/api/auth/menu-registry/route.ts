import { NextRequest } from 'next/server';
import { supabaseService } from '@/lib/supabase';
import { SCHEMAS } from '@/config/constants';
import { successResponse, errorResponse } from '@/lib/errorHandler';

/**
 * AUTH: Menu Registry API (Master List)
 * Route: /api/auth/menu-registry
 */
export async function GET(_req: NextRequest) {
    try {
        const { data, error } = await supabaseService
            .schema(SCHEMAS.AUTH)
            .from('menu_registry')
            .select('*')
            .order('sort_order', { ascending: true });

        if (error) throw new Error(error.message);
        return successResponse(data, 'Menu registry fetched successfully');
    } catch (error: any) {
        return errorResponse(null, error.message || 'Failed to fetch menu registry');
    }
}
