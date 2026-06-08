import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/errorHandler';
import { getUserIdFromToken } from '@/lib/jwt';
import { getUserTenantScope } from '@/middleware/tenantFilter';
import { app_auth, supabaseService } from '@/lib/supabase';

export async function GET(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse('UNAUTHORIZED', 'Unauthorized', 401);

        const scope = await getUserTenantScope(userId);

        const { data: user, error } = await app_auth.users().select(`
            id, email, first_name, last_name, display_name, avatar_url,
            is_active, last_login_at
        `).eq('id', userId).single();

        if (error) throw new Error(error.message);

        // Merge unique permissions
        const allPermissions = new Set<string>();

        try {
            // Fetch Role-Based Permissions (via RPC from app_auth schema)
            const { data: rolePerms, error: rpcError } = await supabaseService
                .schema('app_auth' as any)
                .rpc('get_user_permissions', { p_user_id: userId } as unknown as never);

            if (rpcError) {
                console.error('[API Auth Me] RPC Error:', rpcError.message);
            } else {
                const rPerms = (rolePerms || []) as any[];
                rPerms.forEach((p: any) => {
                    if (p.permission_name) allPermissions.add(p.permission_name);
                });
            }

            // Fetch Granular User Permissions (Direct Query)
            const { data: userOverridePerms } = await app_auth.userPermissions()
                .select('permissions(name)')
                .eq('user_id', userId);

            if (userOverridePerms && Array.isArray(userOverridePerms)) {
                userOverridePerms.forEach((p: any) => {
                    if (p.permissions?.name) allPermissions.add(p.permissions.name);
                });
            }
        } catch (permError: any) {
            console.error('[API Auth Me] Failed to fetch permissions:', permError.message);
            // We continue even if permissions fail to load, returned as empty set
        }

        return successResponse({
            user,
            scope,
            permissions: Array.from(allPermissions)
        }, 'Current user fetched');
    } catch (error: any) {
        return errorResponse('INTERNAL_ERROR', error.message);
    }
}
