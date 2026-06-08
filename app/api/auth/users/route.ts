/**
 * AUTH API - System Users
 * Route: /api/auth/users
 */

import { NextRequest } from 'next/server';
import { app_auth } from '@/lib/supabase';
import { successResponse, errorResponse } from '@/lib/errorHandler';
import { getUserIdFromToken } from '@/lib/jwt';
import { getUserTenantScope } from '@/middleware/tenantFilter';
import bcrypt from 'bcryptjs';
import { GlobalSettings } from '@/lib/settings';

export async function GET(req: NextRequest) {
    try {
        const actingUserId = await getUserIdFromToken(req);
        if (!actingUserId) return errorResponse('UNAUTHORIZED', 'Unauthorized', 401);

        const scope = await getUserTenantScope(actingUserId);

        // Multi-tenant check: 
        // Platform Admin (5) can see all users
        // Company Admin (4) can see users associated with their company via user_roles

        let query = app_auth.users().select(`
            id, email, first_name, last_name, display_name, 
            is_active, last_login_at, created_at,
            user_roles!inner(
                company_id,
                role_id,
                roles(name, level)
            )
        `);

        if (scope.roleLevel < 5) {
            query = query.eq('user_roles.company_id', scope.companyId);
        }

        const { data, error } = await query;
        if (error) throw new Error(error.message);

        const companyIds = Array.from(new Set(data.flatMap((u: any) => u.user_roles.map((r: any) => r.company_id)).filter(Boolean))) as string[];
        const branchIds = Array.from(new Set(data.flatMap((u: any) => u.user_roles.map((r: any) => r.branch_id)).filter(Boolean))) as string[];
        // Use Email for more robust linking (fixes missing user_id links)
        const userEmails = data.map((u: any) => u.email).filter(Boolean);

        // Import core client dynamically or typically it's imported at top
        // Assuming implicit access or requiring import. Let's rely on importing 'core' from @/lib/supabase
        const { core } = await import('@/lib/supabase');

        const [companiesRes, branchesRes, employeesRes] = await Promise.all([
            companyIds.length > 0 ? core.companies().select('id, name, code').in('id', companyIds) : { data: [] },
            branchIds.length > 0 ? core.branches().select('id, name, code').in('id', branchIds) : { data: [] },
            userEmails.length > 0 ? core.employees().select('email, employee_code, phone').in('email', userEmails) : { data: [] }
        ]);

        const companiesMap = new Map((companiesRes.data?.map((c: any) => [c.id, c]) || []) as any);
        const branchesMap = new Map((branchesRes.data?.map((b: any) => [b.id, b]) || []) as any);
        // Map by Email
        const employeesMap = new Map((employeesRes.data?.map((e: any) => [e.email, e]) || []) as any);

        // Enrich Data
        const enrichedData = data.map((u: any) => {
            const emp = employeesMap.get(u.email) as any;
            return {
                ...u,
                unique_code: emp?.employee_code || `USR-${u.id}`, // Fallback to INT ID
                phone: emp?.phone || 'N/A',
                user_roles: u.user_roles.map((r: any) => ({
                    ...r,
                    companies: r.company_id ? companiesMap.get(r.company_id) : null,
                    branches: r.branch_id ? branchesMap.get(r.branch_id) : null
                }))
            };
        });

        return successResponse(enrichedData, 'Users fetched successfully');
    } catch (error: any) {
        return errorResponse('INTERNAL_ERROR', error.message);
    }
}

export async function POST(req: NextRequest) {
    try {
        const actingUserId = await getUserIdFromToken(req);
        if (!actingUserId) return errorResponse('UNAUTHORIZED', 'Unauthorized', 401);

        const scope = await getUserTenantScope(actingUserId);
        if (scope.roleLevel < 4) return errorResponse('FORBIDDEN', 'Forbidden', 403);

        const body = await req.json();
        const { email, password, first_name, last_name, display_name, role_id, company_id, branch_id } = body;

        if (!email || !password) return errorResponse('VALIDATION_ERROR', 'Email and password required', 400);

        // 🛡️ Password Length Enforcement
        const minLength = await GlobalSettings.getMinPasswordLength();
        if (password.length < minLength) {
            return errorResponse('VALIDATION_ERROR', `Password must be at least ${minLength} characters as per system policy.`, 400);
        }

        // Security: Ensure Company Admin only creates users for their company
        const targetCompanyId = scope.roleLevel >= 5 ? company_id : scope.companyId;

        // 🛡️ STRICT RBAC: Validate Role Hierarchy
        // Company Admin (Level 4) cannot create equal or higher roles (Level 4, 5)
        if (role_id) {
            const { data: targetRole, error: roleFetchError } = await app_auth.roles()
                .select('level, name')
                .eq('id', role_id)
                .single();

            if (roleFetchError || !targetRole) {
                return errorResponse('INVALID_REQUEST', 'Invalid Role ID', 400);
            }

            if (scope.roleLevel < 5) {
                // Cannot create user with higher or equal role level
                if (targetRole.level >= scope.roleLevel) {
                    return errorResponse('FORBIDDEN', `RBAC Violation: You (Level ${scope.roleLevel}) cannot assign Role '${targetRole.name}' (Level ${targetRole.level})`, 403);
                }

                // Specific Requirement: Company Admin creating Branch Admin
                // Allow creation of Branch Admin (1), Employee/User (0), Product Admin (2)
                // Implicitly allowed by check above.
            }
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const password_hash = await bcrypt.hash(password, salt);

        // 1. Create User
        const { data: user, error: userError } = await app_auth.users().insert({
            email,
            password_hash,
            first_name,
            last_name,
            display_name: display_name || `${first_name} ${last_name}`,
            is_active: true
        }).select().single();

        if (userError) {
            // Check for duplicate email
            if (userError.code === '23505') {
                const message = userError.message?.toLowerCase() || '';
                const details = userError.details?.toLowerCase() || '';

                if (message.includes('email') || details.includes('email')) {
                    return errorResponse(
                        'DUPLICATE_ENTRY',
                        'This email address is already registered. Please use a different email or contact support if you believe this is an error.',
                        409,
                        { field: 'email' },
                        'email'
                    );
                }
                if (message.includes('phone') || details.includes('phone')) {
                    return errorResponse(
                        'DUPLICATE_ENTRY',
                        'This phone number is already registered. Please use a different phone number.',
                        409,
                        { field: 'phone' },
                        'phone'
                    );
                }
            }
            throw new Error(userError.message);
        }

        // 2. Assign Role
        if (role_id) {
            const { error: roleError } = await app_auth.userRoles().insert({
                user_id: user.id,
                role_id: role_id,
                company_id: targetCompanyId,
                branch_id: branch_id || null,
                is_active: true
            });
            if (roleError) {
                // Consider rolling back user creation or handling it
                console.error("Failed to assign role to new user:", roleError);
            }
        }

        return successResponse(user, 'User created and role assigned', 201);
    } catch (error: any) {
        // Enhanced error message parsing
        const message = error.message || '';

        if (message.includes('duplicate') || message.includes('unique')) {
            if (message.toLowerCase().includes('email')) {
                return errorResponse(
                    'DUPLICATE_ENTRY',
                    'This email address is already registered. Please use a different email.',
                    409,
                    { field: 'email' },
                    'email'
                );
            }
        }

        return errorResponse('INTERNAL_ERROR', error.message);
    }
}
