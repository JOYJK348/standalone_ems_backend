/**
 * Unified Access Control Utilities (Menu & Permissions)
 * 
 * This module centralizes all access control logic, including menu-based 
 * navigation and granular permission checking.
 */

import { supabase } from './supabase';
import { getCachedData, cacheData, CACHE_KEYS, CACHE_TTL, getCachedUserPermissions, cacheUserPermissions } from './redis';


// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TYPES & INTERFACES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface MenuItem {
    id: number;
    menu_key: string;
    menu_name: string;
    display_name: string;
    route: string;
    icon?: string;
    parent_menu_id?: number;
    sort_order: number;
    product: string;
    schema_name: string;
    is_active: boolean;
    is_visible: boolean;
    children?: MenuItem[];
    permissions: string[];
}

export interface Role {
    name: string;
    display_name?: string;
    level: number;
    company_id?: number;
    company_name?: string;
    branch_id?: number;
    branch_name?: string;
}

export class PermissionError extends Error {
    constructor(message: string = 'Permission denied') {
        super(message);
        this.name = 'PermissionError';
    }
}

export class MenuAccessError extends Error {
    constructor(message: string = 'Menu access denied') {
        super(message);
        this.name = 'MenuAccessError';
    }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PERMISSION LOGIC (GRANULAR)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Get user permissions (with caching)
 */
export async function getUserPermissions(userId: number): Promise<string[]> {
    const cached = await getCachedUserPermissions(userId);
    if (cached) return cached;

    const { data, error } = await supabase
        .schema('app_auth')
        .rpc('get_user_permissions', { p_user_id: userId });

    if (error) throw new Error('Failed to fetch user permissions');

    const permissions = (data || []).map((row: any) => row.permission_name);
    await cacheUserPermissions(userId, permissions);
    return permissions;
}

/**
 * Get user roles with details (level, display name)
 */
export async function getUserRolesDetailed(userId: number): Promise<Role[]> {
    const { data: userRoles, error } = await supabase
        .schema('app_auth')
        .from('user_roles')
        .select(`
            company_id,
            branch_id,
            roles:role_id (
                name,
                display_name,
                level
            )
        `)
        .eq('user_id', userId)
        .eq('is_active', true);

    if (error) {
        console.error('Error fetching user roles:', error);
        throw new Error('Failed to fetch user roles');
    }

    if (!userRoles || userRoles.length === 0) return [];

    // Fetch Branch & Company names for better UI
    const branchIds = userRoles.map(ur => ur.branch_id).filter(Boolean);
    const companyIds = userRoles.map(ur => ur.company_id).filter(Boolean);

    const { data: branches } = await supabase.schema('core').from('branches').select('id, name').in('id', branchIds);
    const { data: companies } = await supabase.schema('core').from('companies').select('id, name').in('id', companyIds);

    return userRoles
        .filter((row: any) => row.roles)
        .map((row: any) => ({
            name: row.roles.name,
            display_name: row.roles.display_name,
            level: row.roles.level,
            company_id: row.company_id,
            company_name: companies?.find(c => c.id === row.company_id)?.name,
            branch_id: row.branch_id,
            branch_name: branches?.find(b => b.id === row.branch_id)?.name
        }))
        .sort((a, b) => b.level - a.level);
}

/**
 * Get user roles as strings (backwards compatibility)
 */
export async function getUserRoles(userId: number): Promise<string[]> {
    const roles = await getUserRolesDetailed(userId);
    return roles.map(r => r.name);
}

/**
 * Check if user has a specific permission
 */
export async function hasPermission(userId: number, requiredPermission: string): Promise<boolean> {
    const permissions = await getUserPermissions(userId);
    return permissions.includes(requiredPermission);
}

/**
 * Require a specific permission (throws if denied)
 */
export async function requirePermission(userId: number, requiredPermission: string): Promise<void> {
    const hasPerm = await hasPermission(userId, requiredPermission);
    if (!hasPerm) throw new PermissionError(`Missing permission: ${requiredPermission}`);
}

/**
 * Require any of the specified permissions
 */
export async function requireAnyPermission(userId: number, requiredPermissions: string[]): Promise<void> {
    const permissions = await getUserPermissions(userId);
    const hasAny = requiredPermissions.some(p => permissions.includes(p));
    if (!hasAny) throw new PermissionError(`Missing one of: ${requiredPermissions.join(', ')}`);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MENU LOGIC (NAVIGATION)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Get hierarchical menus for a user
 */
export async function getUserMenus(userId: number): Promise<MenuItem[]> {
    const cacheKey = CACHE_KEYS.USER_MENUS(userId);
    const cached = await getCachedData<MenuItem[]>(cacheKey);
    if (cached) return cached;

    const { data, error } = await supabase
        .schema('app_auth')
        .rpc('get_user_menus', { p_user_id: userId });

    if (error) throw new Error('Failed to fetch user menus');

    const menus = buildMenuHierarchy(data || []);
    await cacheData(cacheKey, menus, CACHE_TTL.MENUS);
    return menus;
}

function buildMenuHierarchy(flatMenus: any[]): MenuItem[] {
    const menuMap = new Map<number, MenuItem>();
    const rootMenus: MenuItem[] = [];

    flatMenus.forEach((menu) => {
        menuMap.set(menu.menu_id, {
            id: menu.menu_id,
            menu_key: menu.menu_key,
            menu_name: menu.menu_name,
            display_name: menu.display_name || menu.menu_name,
            route: menu.route,
            icon: menu.icon,
            parent_menu_id: menu.parent_menu_id,
            sort_order: menu.sort_order,
            product: menu.product,
            schema_name: menu.schema_name,
            is_active: menu.is_active,
            is_visible: menu.is_visible,
            children: [],
            permissions: menu.permissions || [],
        });
    });

    menuMap.forEach((menu) => {
        if (menu.parent_menu_id) {
            const parent = menuMap.get(menu.parent_menu_id);
            if (parent) parent.children!.push(menu);
        } else {
            rootMenus.push(menu);
        }
    });

    const sortMenus = (items: MenuItem[]) => {
        items.sort((a, b) => a.sort_order - b.sort_order);
        items.forEach(i => i.children && sortMenus(i.children));
    };
    sortMenus(rootMenus);
    return rootMenus;
}

/**
 * Require access to a specific menu key
 */
export async function requireMenuAccess(userId: number, menuKey: string): Promise<void> {
    const menus = await getUserMenus(userId);
    const hasAccess = findMenuByKey(menus, menuKey) !== null;
    if (!hasAccess) throw new MenuAccessError(`No access to menu: ${menuKey}`);
}

function findMenuByKey(menus: MenuItem[], menuKey: string): MenuItem | null {
    for (const menu of menus) {
        if (menu.menu_key === menuKey) return menu;
        if (menu.children) {
            const found = findMenuByKey(menu.children, menuKey);
            if (found) return found;
        }
    }
    return null;
}
