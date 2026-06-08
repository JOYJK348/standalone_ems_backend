import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/errorHandler';
import { supabase } from '@/lib/supabase';
import { getUserIdFromToken } from '@/lib/jwt';
import { getUserTenantScope } from '@/middleware/tenantFilter';
import { logger } from '@/lib/logger';
import bcrypt from 'bcryptjs';
import { AuditService } from '@/lib/services/AuditService';

/**
 * Platform Onboarding API
 * Creates a new company, a root admin user, and assigns the COMPANY_ADMIN role.
 */
export async function POST(req: NextRequest) {
    let companyId: number | null = null;
    let userId: number | null = null;

    try {
        logger.info('[Onboarding] Starting enterprise onboarding...');
        // 1. Auth Check (Platform Admin Only)
        const requestUserId = await getUserIdFromToken(req);
        if (!requestUserId) {
            logger.error('[Onboarding] Unauthorized: No user ID found in token');
            return errorResponse('UNAUTHORIZED', 'Unauthorized', 401);
        }

        const scope = await getUserTenantScope(requestUserId);
        if (scope.roleLevel < 5) {
            logger.error('[Onboarding] Forbidden: User level too low', { userId: requestUserId, level: scope.roleLevel });
            return errorResponse('FORBIDDEN', 'Permission Denied: Only Platform Admin can perform this action', 403);
        }

        // 2. Parse Body
        const body = await req.json();
        const { company, admin } = body;

        if (!company?.name || !company?.code || !admin?.email || !admin?.password) {
            return errorResponse('VALIDATION_ERROR', 'Missing required fields (Company Name, Code, Admin Email, Password)', 400);
        }

        console.log('[Onboarding] Request validated', { companyCode: company.code, adminEmail: admin.email });

        // 3. Duplicate Checks (Fail early with 409)
        const { data: existingCompany } = await supabase
            .schema('core')
            .from('companies')
            .select('id')
            .eq('code', company.code)
            .maybeSingle();

        if (existingCompany) {
            return errorResponse('CONFLICT', `Company code '${company.code}' already exists`, 409);
        }

        const { data: existingUser } = await supabase
            .schema('app_auth')
            .from('users')
            .select('id')
            .eq('email', admin.email)
            .maybeSingle();

        if (existingUser) {
            return errorResponse('CONFLICT', `User with email '${admin.email}' already exists`, 409);
        }

        // 4. Subscription Logic - Support for Custom Templates
        const now = new Date();
        const startDate = now.toISOString().split('T')[0];
        const endDateObj = new Date();

        // Check if using a custom template
        const templateId = company.subscription_template_id || company.template_id;
        let planConfig: {
            max_users: number;
            max_branches: number;
            max_departments: number;
            max_designations: number;
            enabled_modules: string[];
            allowed_menu_ids: number[];
            trial_days: number;
            support_level: string;
        };
        let plan = (company.subscription_plan || 'TRIAL').toUpperCase();

        if (templateId) {
            // Load from custom template
            console.log('[Onboarding] Using custom template:', templateId);
            const { data: template, error: tplError } = await supabase
                .schema('core')
                .from('subscription_templates')
                .select('*')
                .eq('id', templateId)
                .single();

            if (tplError || !template) {
                return errorResponse('NOT_FOUND', 'Subscription template not found', 404);
            }

            plan = template.base_plan || 'CUSTOM';
            planConfig = {
                max_users: template.max_users || 10,
                max_branches: template.max_branches || 1,
                max_departments: template.max_departments || 5,
                max_designations: template.max_designations || 5,
                enabled_modules: template.enabled_modules || ['EMS', 'LMS', 'ATTENDANCE', 'LIVE_CLASSES', 'ASSESSMENTS', 'MATERIALS'],
                allowed_menu_ids: template.allowed_menu_ids || [],
                trial_days: template.trial_days || 0,
                support_level: template.support_level || 'EMAIL'
            };

            if (template.validity_days > 0) {
                endDateObj.setDate(now.getDate() + template.validity_days);
            } else {
                endDateObj.setFullYear(now.getFullYear() + 1);
            }
        } else {
            // Use predefined plan configuration
            const PLAN_CONFIG: Record<string, typeof planConfig> = {
                'TRIAL': {
                    max_users: 10,
                    max_branches: 1,
                    max_departments: 5,
                    max_designations: 5,
                    enabled_modules: ['EMS', 'LMS', 'ATTENDANCE', 'LIVE_CLASSES', 'ASSESSMENTS', 'MATERIALS'],
                    allowed_menu_ids: [],
                    trial_days: 30,
                    support_level: 'EMAIL'
                },
                'BASIC': {
                    max_users: 25,
                    max_branches: 3,
                    max_departments: 10,
                    max_designations: 10,
                    enabled_modules: ['EMS', 'LMS', 'ATTENDANCE', 'LIVE_CLASSES', 'ASSESSMENTS', 'MATERIALS'],
                    allowed_menu_ids: [],
                    trial_days: 0,
                    support_level: 'EMAIL'
                },
                'STANDARD': {
                    max_users: 100,
                    max_branches: 5,
                    max_departments: 25,
                    max_designations: 25,
                    enabled_modules: ['EMS', 'LMS', 'ATTENDANCE', 'LIVE_CLASSES', 'ASSESSMENTS', 'MATERIALS'],
                    allowed_menu_ids: [],
                    trial_days: 0,
                    support_level: 'PRIORITY'
                },
                'ENTERPRISE': {
                    max_users: 0,
                    max_branches: 0,
                    max_departments: 0,
                    max_designations: 0,
                    enabled_modules: ['EMS', 'LMS', 'ATTENDANCE', 'LIVE_CLASSES', 'ASSESSMENTS', 'MATERIALS'],
                    allowed_menu_ids: [],
                    trial_days: 0,
                    support_level: '24X7'
                }
            };

            planConfig = PLAN_CONFIG[plan] || PLAN_CONFIG['TRIAL'];

            if (plan === 'TRIAL') {
                endDateObj.setDate(now.getDate() + 30);
            } else {
                endDateObj.setFullYear(now.getFullYear() + 1);
            }
        }

        const endDate = endDateObj.toISOString().split('T')[0];

        // Determine Subscription Prefix for ID Generation
        const planPrefix = plan === 'CUSTOM' ? 'C' : plan === 'STANDARD' ? 'S' : plan === 'ENTERPRISE' ? 'E' : plan === 'BASIC' ? 'B' : 'T';

        // 5. Create Company with all plan-related fields
        console.log('[Onboarding] Creating company with plan:', { plan, maxUsers: planConfig.max_users, maxBranches: planConfig.max_branches });
        const { data: newCompany, error: companyError } = await supabase
            .schema('core')
            .from('companies')
            .insert({
                name: company.name,
                code: company.code,
                legal_name: company.legal_name,
                email: company.email,
                phone: company.phone,
                website: company.website,
                address_line1: company.address_line1,
                address_line2: company.address_line2,
                city: company.city,
                state: company.state,
                country: company.country || 'India',
                postal_code: company.postal_code,
                tax_id: company.tax_id,
                pan_number: company.pan_number,
                registration_number: company.registration_number,
                // Subscription Fields
                subscription_plan: plan,
                subscription_status: 'ACTIVE',
                subscription_start_date: startDate,
                subscription_end_date: endDate,
                // Plan Limits - Use custom limits if provided, otherwise use plan config
                max_users: company.max_users ?? planConfig.max_users,
                max_branches: company.max_branches ?? planConfig.max_branches,
                max_departments: company.max_departments ?? planConfig.max_departments,
                max_designations: company.max_designations ?? planConfig.max_designations,
                enabled_modules: company.enabled_modules || planConfig.enabled_modules,
                // Custom Plan - allowed menu IDs
                allowed_menu_ids: company.allowed_menu_ids || planConfig.allowed_menu_ids || null,
                // Trial specific
                trial_started_at: plan === 'TRIAL' ? now.toISOString() : null,
                trial_expired: false,
                // Status
                is_active: true
            } as any)
            .select()
            .single();

        if (companyError) {
            console.error('[Onboarding] Company creation failed:', companyError);
            throw new Error(`Company Creation Failed: ${companyError.message}`);
        }
        companyId = (newCompany as any).id;
        console.log('[Onboarding] Company created:', { id: companyId, plan, maxUsers: planConfig.max_users, maxBranches: planConfig.max_branches });

        // 6. Create Admin User
        console.log('[Onboarding] Creating admin user...');
        const passwordHash = await bcrypt.hash(admin.password, 10);
        const { data: newUser, error: userError } = await supabase
            .schema('app_auth')
            .from('users')
            .insert({
                email: admin.email,
                password_hash: passwordHash,
                first_name: admin.firstName,
                last_name: admin.lastName || 'Admin',
                display_name: `${admin.firstName} ${admin.lastName || ''}`.trim(),
                is_active: true,
                is_verified: true
            } as any)
            .select()
            .single();

        if (userError) {
            console.error('[Onboarding] User creation failed:', userError);
            throw new Error(`User Creation Failed: ${userError.message}`);
        }
        userId = (newUser as any).id;
        console.log('[Onboarding] User created:', { id: userId });

        // 7. Assign COMPANY_ADMIN Role
        console.log('[Onboarding] Assigning role...');
        const { data: roleData, error: roleError } = await supabase
            .schema('app_auth')
            .from('roles')
            .select('id')
            .eq('name', 'COMPANY_ADMIN')
            .single();

        if (roleError || !roleData) {
            throw new Error('System Error: COMPANY_ADMIN role not found in database. Please run system seeds.');
        }

        const { error: assignmentError } = await supabase
            .schema('app_auth')
            .from('user_roles')
            .insert({
                user_id: userId,
                role_id: (roleData as any).id,
                company_id: companyId
            } as any);

        if (assignmentError) {
            console.error('[Onboarding] Role assignment failed:', assignmentError);
            throw new Error(`Role Assignment Failed: ${assignmentError.message}`);
        }

        // 8. Create Root Employee Record (Subscription-based ID)
        // Format: {CODE}-{PLAN}-{001} (e.g. DAI-T-001)
        const employeeCode = `${company.code}-${planPrefix}-001`;
        console.log('[Onboarding] Creating root employee record:', { employeeCode });

        const { error: employeeError } = await supabase
            .schema('core')
            .from('employees')
            .insert({
                company_id: companyId,
                employee_code: employeeCode,
                first_name: admin.firstName,
                last_name: admin.lastName || 'Admin',
                email: admin.email,
                is_active: true
            } as any);

        if (employeeError) {
            // We don't throw here to avoid rolling back the whole transaction if just the employee record fails
            // but we log it for investigation.
            console.warn('[Onboarding] Employee record creation failed (Optional step):', employeeError.message);
        }

        // 9. Apply Subscription Menu Permissions
        console.log('[Onboarding] Applying subscription menu permissions...');
        try {
            // Insert allowed menus based on enabled_modules or allowed_menu_ids
            if (planConfig.allowed_menu_ids && planConfig.allowed_menu_ids.length > 0) {
                // Use specific menu IDs from custom template
                const menuInserts = planConfig.allowed_menu_ids.map(menuId => ({
                    company_id: companyId,
                    menu_id: menuId,
                    can_view: true,
                    can_create: true,
                    can_edit: true,
                    can_delete: true,
                    is_active: true,
                    created_by: requestUserId
                }));

                await supabase
                    .schema('core')
                    .from('company_subscription_menus')
                    .insert(menuInserts as any);
            } else {
                // Derive menus from enabled_modules
                const { data: menus } = await supabase
                    .schema('app_auth')
                    .from('menu_registry')
                    .select('id, module_key, is_core')
                    .eq('is_active', true);

                if (menus && menus.length > 0) {
                    const allowedMenus = menus.filter(m =>
                        m.is_core ||
                        !m.module_key ||
                        planConfig.enabled_modules.includes(m.module_key)
                    );

                    const menuInserts = allowedMenus.map(menu => ({
                        company_id: companyId,
                        menu_id: menu.id,
                        can_view: true,
                        can_create: true,
                        can_edit: true,
                        can_delete: true,
                        is_active: true,
                        created_by: requestUserId
                    }));

                    if (menuInserts.length > 0) {
                        await supabase
                            .schema('core')
                            .from('company_subscription_menus')
                            .insert(menuInserts as any);
                    }
                }
            }

            // Update company's cached allowed_menu_ids
            const { data: allowedMenus } = await supabase
                .schema('core')
                .from('company_subscription_menus')
                .select('menu_id')
                .eq('company_id', companyId)
                .eq('is_active', true);

            if (allowedMenus && allowedMenus.length > 0) {
                const menuIds = allowedMenus.map(m => m.menu_id);
                await supabase
                    .schema('core')
                    .from('companies')
                    .update({
                        allowed_menu_ids: menuIds,
                        subscription_template_id: templateId || null
                    } as any)
                    .eq('id', companyId);
            }

            console.log('[Onboarding] Menu permissions applied successfully');
        } catch (menuError: any) {
            console.warn('[Onboarding] Menu permissions setup failed (non-critical):', menuError.message);
        }

        console.log('[Onboarding] Success! Enterprise onboarded.');

        // 9. Audit Logging
        if (companyId) {
            await AuditService.logAction({
                userId: requestUserId,
                action: 'ONBOARD_ENTERPRISE',
                tableName: 'companies',
                schemaName: 'core',
                recordId: companyId.toString(),
                newData: { company: newCompany, adminEmail: admin.email },
                ipAddress: AuditService.getIP(req),
                userAgent: req.headers.get('user-agent') || 'unknown',
                companyId: companyId
            });
        }

        // 10. Create Company Branding (if provided)
        if (company.logo_url || company.branding) {
            console.log('[Onboarding] Setting up company branding...');
            const brandingData = {
                company_id: companyId,
                logo_url: company.logo_url || company.branding?.logo_url,
                favicon_url: company.favicon_url || company.branding?.favicon_url,
                primary_color: company.branding?.primary_color || '#0066FF',
                secondary_color: company.branding?.secondary_color || '#0052CC',
                accent_color: company.branding?.accent_color || '#00C853',
                is_active: true,
                created_by: requestUserId
            };

            const { error: brandingError } = await supabase
                .schema('core')
                .from('company_branding')
                .insert(brandingData as any);

            if (brandingError) {
                console.warn('[Onboarding] Branding setup failed (non-critical):', brandingError.message);
            }
        }

        return successResponse({
            company: newCompany,
            admin: {
                id: userId,
                email: (newUser as any).email,
                name: (newUser as any).display_name,
                employee_code: employeeCode
            }
        }, 'Company and Admin created successfully', 201);

    } catch (error: any) {
        console.error('[Onboarding] Transaction failed:', error.message);

        // COMPENSATION logic (Rollback)
        try {
            if (userId) {
                console.log('[Onboarding] Rolling back user creation:', userId);
                await supabase.schema('app_auth').from('users').delete().eq('id', userId);
            }
            if (companyId) {
                console.log('[Onboarding] Rolling back company creation:', companyId);
                await supabase.schema('core').from('companies').delete().eq('id', companyId);
            }
        } catch (rollbackError: any) {
            console.error('[Onboarding] Rollback failed!', rollbackError.message);
        }

        return errorResponse('TRANSACTION_FAILED', error.message || 'Onboarding transaction failed', 500);
    }
}
