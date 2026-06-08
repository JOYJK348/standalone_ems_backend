/**
 * Menu Registry API
 * Returns system menu structure for subscription configuration
 * Route: /api/platform/menu-registry
 */

import { NextRequest } from 'next/server';
import { successResponse, errorResponse } from '@/lib/errorHandler';
import { supabase } from '@/lib/supabase';
import { getUserIdFromToken } from '@/lib/jwt';
import { getUserTenantScope } from '@/middleware/tenantFilter';

// GET - Get menu registry (grouped by module)
export async function GET(req: NextRequest) {
    try {
        const userId = await getUserIdFromToken(req);
        if (!userId) return errorResponse('UNAUTHORIZED', 'Unauthorized', 401);

        const _scope = await getUserTenantScope(userId);

        // Build query
        const { data: menus, error } = await supabase
            .schema('app_auth')
            .from('menu_registry')
            .select('*')
            .eq('is_active', true)
            .order('sort_order', { ascending: true });

        if (error) throw new Error(error.message);

        // Get unique modules
        const modules = new Set<string>();
        menus?.forEach(m => {
            if (m.module_key) modules.add(m.module_key);
        });

        // Group menus by module
        const grouped: Record<string, any[]> = {};
        const coreMenus: any[] = [];

        menus?.forEach(menu => {
            if (menu.is_core) {
                coreMenus.push(menu);
            } else if (menu.module_key) {
                if (!grouped[menu.module_key]) {
                    grouped[menu.module_key] = [];
                }
                grouped[menu.module_key].push(menu);
            }
        });

        // Build hierarchical structure
        const buildTree = (items: any[]) => {
            const map: Record<number, any> = {};
            const roots: any[] = [];

            items.forEach(item => {
                map[item.id] = { ...item, children: [] };
            });

            items.forEach(item => {
                if (item.parent_menu_id && map[item.parent_menu_id]) {
                    map[item.parent_menu_id].children.push(map[item.id]);
                } else {
                    roots.push(map[item.id]);
                }
            });

            return roots;
        };

        // Build response
        const moduleList = [
            { key: 'HR', name: 'HR Management', description: 'Employee management, departments, designations' },
            { key: 'ATTENDANCE', name: 'Attendance', description: 'Daily attendance, leaves, holidays' },
            { key: 'PAYROLL', name: 'Payroll', description: 'Salary processing, payslips, deductions' },
            { key: 'CRM', name: 'CRM', description: 'Vendors, Partners, Job Seekers, Internships, Course Enquiries' },
            { key: 'LMS', name: 'LMS', description: 'Courses, online classes, assessments' },
            { key: 'FINANCE', name: 'Finance', description: 'Invoices, payments, expenses, ledger' }
        ];

        const result = {
            modules: moduleList.map(mod => ({
                ...mod,
                menus: buildTree(grouped[mod.key] || [])
            })),
            coreMenus: coreMenus,
            allMenus: menus,
            totalMenus: menus?.length || 0
        };

        return successResponse(result, 'Menu registry fetched successfully');
    } catch (error: any) {
        return errorResponse('INTERNAL_ERROR', error.message, 500);
    }
}
