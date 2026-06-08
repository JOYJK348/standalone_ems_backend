/**
 * CORE API - Branches (Multi-Tenant)
 * Route: /api/core/branches
 */

import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/errorHandler';
import { core } from '@/lib/supabase';
import { applyTenantFilter, autoAssignCompany } from '@/middleware/tenantFilter';
import { getUserIdFromToken } from '@/lib/jwt';
import { AuditService } from '@/lib/services/AuditService';
import { app_auth } from '@/lib/supabase';
import bcrypt from 'bcryptjs';

export async function GET(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse('UNAUTHORIZED', 'Unauthorized', 401);

        let query = core.branches()
            .select(`
                *,
                companies:company_id (id, name, code)
            `)
            .eq('is_active', true)
            .order('name');

        query = await applyTenantFilter(userId, query, { isTableBranches: true });

        const { data, error } = await query;
        if (error) throw new Error(error.message);

        return successResponse(data, `Branches fetched successfully (${data?.length || 0} records)`);

    } catch (error: any) {
        return errorResponse('INTERNAL_ERROR', error.message || 'Failed to fetch branches', 500);
    }
}

export async function POST(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse('UNAUTHORIZED', 'Unauthorized', 401);

        let data = await req.json();

        // Auto-assign company_id
        try {
            data = await autoAssignCompany(userId, data);
        } catch (assignError: any) {
            // If Platform Admin didn't specify company_id, and they are assigned to one, use it
            const { getUserTenantScope } = await import('@/middleware/tenantFilter');
            const scope = await getUserTenantScope(userId);
            if (scope.roleLevel >= 5 && scope.companyId) {
                data.company_id = scope.companyId;
            } else {
                throw assignError;
            }
        }

        // ⚡ LIMIT ENFORCEMENT: Check if company can add more branches
        const { canAddResource } = await import('@/lib/services/LimitService');
        const limitCheck = await canAddResource(data.company_id, 'branch');

        if (!limitCheck.allowed) {
            return errorResponse('LIMIT_REACHED', limitCheck.message, 403);
        }

        // Validation
        if (!data.name || !data.code) {
            return errorResponse('VALIDATION_ERROR', 'name and code are required', 400);
        }

        // Map frontend fields to DB columns
        const branchData: any = {
            company_id: data.company_id,
            name: data.name,
            code: data.code,
            email: data.email || null,
            phone: data.phone || null,
            is_active: data.is_active !== false,
            is_head_office: data.is_head_office === true,
            address_line1: data.address || data.address_line1 || null,
            city: data.city || null,
            state: data.state || null,
            country: data.country || 'India',
            postal_code: data.pincode || data.postal_code || null
        };

        // Add branch_type if it exists in schema (some versions might have it)
        if (data.branch_type) branchData.branch_type = data.branch_type;

        console.log('Creates branch with data:', branchData);

        const { data: branch, error } = await core.branches()
            .insert(branchData)
            .select('*, companies:company_id (id, name)')
            .single();

        if (error) {
            console.error('Database Error:', error);
            throw new Error(error.message);
        }

        // Audit Log (Triggers Notification)
        await AuditService.logAction({
            userId,
            action: 'CREATE',
            tableName: 'branches',
            recordId: branch.id,
            newData: branch,
            companyId: branch.company_id, // Important for scoping
            ipAddress: AuditService.getIP(req),
        });

        // ------------------------------------------------------------------
        // OPTIONAL: CREATE BRANCH ADMINS (Support for multiple admins)
        // ------------------------------------------------------------------
        const adminsToCreate = Array.isArray(data.admins) ? data.admins :
            (data.admin_email && data.admin_password ? [{
                type: 'BRANCH_ADMIN',
                email: data.admin_email,
                first_name: data.admin_name?.split(' ')[0] || 'Branch',
                last_name: data.admin_name?.split(' ').slice(1).join(' ') || 'Admin',
                password: data.admin_password,
                permissions: data.admin_permissions
            }] : []);

        if (adminsToCreate.length > 0) {
            try {
                // 1. Get Role Definitions
                const { data: allRoles } = await app_auth.roles().select('id, name');

                for (const admin of adminsToCreate) {
                    const roleName = admin.type || 'BRANCH_ADMIN';
                    const roleData = allRoles?.find(r => r.name === roleName);

                    if (roleData) {
                        try {
                            // 3. Create or Get User
                            let newUser = null;
                            const normalizedEmail = (admin.email || '').toLowerCase();

                            // Map both camelCase (frontend) and snake_case (backend)
                            const firstName = admin.first_name || admin.firstName || 'Admin';
                            const lastName = admin.last_name || admin.lastName || '';
                            const password = admin.password || admin.admin_password;
                            const password_hash = password ? await bcrypt.hash(password, await bcrypt.genSalt(10)) : null;
                            const displayName = `${firstName} ${lastName}`.trim();

                            if (!normalizedEmail || !password_hash) {
                                console.error(`❌ Missing email or password for admin provisioning:`, admin);
                                continue;
                            }

                            const { data: existingUser } = await app_auth.users()
                                .select('id, email')
                                .eq('email', normalizedEmail)
                                .single();

                            if (existingUser) {
                                newUser = existingUser;
                                console.log(`ℹ️ User ${normalizedEmail} already exists, using existing record.`);
                            } else {
                                const { data: createdUser, error: userError } = await app_auth.users()
                                    .insert({
                                        email: normalizedEmail,
                                        password_hash,
                                        first_name: firstName,
                                        last_name: lastName,
                                        display_name: displayName,
                                        is_active: true,
                                        is_verified: true
                                    })
                                    .select()
                                    .single();

                                if (userError) {
                                    console.error(`❌ User Insert Error for ${normalizedEmail}:`, userError);
                                } else {
                                    newUser = createdUser;
                                }
                            }

                            if (newUser) {
                                // 4. Assign Role (Scoped to this Branch & Company)
                                const { error: roleErr } = await app_auth.userRoles().insert({
                                    user_id: newUser.id,
                                    role_id: roleData.id,
                                    company_id: branch.company_id,
                                    branch_id: branch.id,
                                    is_active: true
                                });

                                if (roleErr) console.error(`❌ Role Assignment Error for ${normalizedEmail}:`, roleErr);

                                // 5. Assign Granular Permissions (If Provided)
                                const perms = admin.permissions || data.admin_permissions;
                                if (perms && Array.isArray(perms) && perms.length > 0) {
                                    const { data: permsData, error: permsFetchErr } = await app_auth.permissions()
                                        .select('id, name')
                                        .in('name', perms);

                                    if (permsFetchErr) console.error(`❌ Permissions Fetch Error:`, permsFetchErr);

                                    if (permsData && permsData.length > 0) {
                                        const userPermsToInsert = permsData.map((p: any) => ({
                                            user_id: newUser.id,
                                            permission_id: p.id,
                                            company_id: branch.company_id
                                        }));
                                        const { error: upErr } = await app_auth.userPermissions().insert(userPermsToInsert);
                                        if (upErr) console.error(`❌ User Permissions Insert Error:`, upErr);
                                    }
                                }

                                // 6. AUTO-CREATE EMPLOYEE PROFILE
                                try {
                                    // Check/Create Designation
                                    let desgId = null;
                                    const desgName = roleName === 'BRANCH_ADMIN' ? 'Branch Manager' :
                                        roleName === 'HR_ADMIN' ? 'HR Manager' :
                                            roleName === 'FINANCE_ADMIN' ? 'Finance Head' : 'Department Admin';

                                    const { data: existingDesg } = await core.designations()
                                        .select('id')
                                        .eq('title', desgName)
                                        .eq('company_id', branch.company_id)
                                        .single();

                                    if (existingDesg) {
                                        desgId = existingDesg.id;
                                    } else {
                                        const { data: newDesg } = await core.designations()
                                            .insert({
                                                company_id: branch.company_id,
                                                title: desgName,
                                                code: `DESG-${roleName.substring(0, 10)}-${branch.id}`.slice(0, 50)
                                            })
                                            .select('id')
                                            .single();
                                        if (newDesg) desgId = newDesg.id;
                                    }

                                    // Create Employee Record
                                    await core.employees().insert({
                                        company_id: branch.company_id,
                                        branch_id: branch.id,
                                        user_id: newUser.id,
                                        first_name: newUser.first_name,
                                        last_name: newUser.last_name,
                                        email: newUser.email,
                                        employee_code: `EMP-${branch.code}-${Math.floor(1000 + Math.random() * 9000)}`,
                                        designation_id: desgId,
                                        is_active: true,
                                        joining_date: new Date().toISOString()
                                    });
                                } catch (empErr) {
                                    console.error('Failed to auto-create employee profile:', empErr);
                                }

                                console.log(`✅ Created Branch Admin: ${newUser.email} for Branch: ${branch.name}`);
                            }
                        } catch (itemErr) {
                            console.error(`Failed to create admin ${admin.email}:`, itemErr);
                        }
                    }
                }
            } catch (err) {
                console.error('Branch Admin Provisioning Failed:', err);
            }
        }

        return successResponse(branch, 'Branch created successfully', 201);

    } catch (error: any) {
        console.error('Create Branch Error:', error);
        return errorResponse('INTERNAL_ERROR', error.message || 'Failed to create branch', 500);
    }
}
