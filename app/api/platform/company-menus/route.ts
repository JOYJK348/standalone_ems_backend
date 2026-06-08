/**
 * Company Allowed Menus API
 * Returns menus allowed for the current user's company
 * Route: /api/platform/company-menus
 */

import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/errorHandler';
import { supabase } from '@/lib/supabase';
import { getUserIdFromToken } from '@/lib/jwt';
import { getUserTenantScope } from '@/middleware/tenantFilter';

// GET - Get allowed menus for current company
export async function GET(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse('UNAUTHORIZED', 'Unauthorized', 401);

        const scope = await getUserTenantScope(userId);

        // Platform Admin sees all menus
        if (scope.roleLevel >= 5) {
            const { data: allMenus, error } = await supabase
                .schema('app_auth')
                .from('menu_registry')
                .select('*')
                .eq('is_active', true)
                .eq('is_visible', true)
                .order('sort_order');

            if (error) throw new Error(error.message);

            return successResponse({
                menus: allMenus,
                plan: 'PLATFORM',
                isUnlimited: true
            }, 'Platform admin has access to all menus');
        }

        // Company-scoped users
        if (!scope.companyId) {
            return errorResponse('FORBIDDEN', 'No company scope found', 403);
        }

        // Get company's subscription info
        const { data: company, error: companyError } = await supabase
            .schema('core')
            .from('companies')
            .select('id, subscription_plan, enabled_modules, allowed_menu_ids, subscription_template_id')
            .eq('id', scope.companyId)
            .single();

        if (companyError || !company) {
            return errorResponse('NOT_FOUND', 'Company not found', 404);
        }

        let allowedMenus: any[] = [];

        // Method 1: Use cached allowed_menu_ids if available
        if (company.allowed_menu_ids && Array.isArray(company.allowed_menu_ids) && company.allowed_menu_ids.length > 0) {
            const { data: menus } = await supabase
                .schema('app_auth')
                .from('menu_registry')
                .select('*')
                .in('id', company.allowed_menu_ids)
                .eq('is_active', true)
                .eq('is_visible', true)
                .order('sort_order');

            allowedMenus = menus || [];
        }
        // Method 2: Use company_subscription_menus table
        else {
            const { data: subMenus } = await supabase
                .schema('core')
                .from('company_subscription_menus')
                .select(`
                    menu_id,
                    can_view,
                    can_create,
                    can_edit,
                    can_delete,
                    menu:menu_id (
                        id,
                        menu_key,
                        menu_name,
                        display_name,
                        parent_menu_id,
                        route,
                        icon,
                        sort_order,
                        module_key,
                        is_core
                    )
                `)
                .eq('company_id', scope.companyId)
                .eq('is_active', true);

            if (subMenus && subMenus.length > 0) {
                allowedMenus = subMenus.map(sm => ({
                    ...sm.menu,
                    can_view: sm.can_view,
                    can_create: sm.can_create,
                    can_edit: sm.can_edit,
                    can_delete: sm.can_delete
                })).filter(m => m);
            }
        }

        // Method 3: Fall back to module-based filtering
        if (allowedMenus.length === 0 && company.enabled_modules) {
            const modules = Array.isArray(company.enabled_modules)
                ? company.enabled_modules
                : JSON.parse(company.enabled_modules || '[]');

            const { data: menus } = await supabase
                .schema('app_auth')
                .from('menu_registry')
                .select('*')
                .eq('is_active', true)
                .eq('is_visible', true)
                .order('sort_order');

            if (menus) {
                allowedMenus = menus.filter(m =>
                    m.is_core ||
                    !m.module_key ||
                    modules.includes(m.module_key)
                );
            }
        }

        // Build hierarchical structure
        const menuMap: Record<number, any> = {};
        const rootMenus: any[] = [];

        allowedMenus.forEach(menu => {
            menuMap[menu.id] = { ...menu, children: [] };
        });

        allowedMenus.forEach(menu => {
            if (menu.parent_menu_id && menuMap[menu.parent_menu_id]) {
                menuMap[menu.parent_menu_id].children.push(menuMap[menu.id]);
            } else {
                rootMenus.push(menuMap[menu.id]);
            }
        });

        return successResponse({
            menus: rootMenus,
            flatMenus: allowedMenus,
            plan: company.subscription_plan,
            enabledModules: company.enabled_modules,
            templateId: company.subscription_template_id
        }, `Fetched ${allowedMenus.length} allowed menus`);
    } catch (error: any) {
        return errorResponse('INTERNAL_ERROR', error.message, 500);
    }
}
