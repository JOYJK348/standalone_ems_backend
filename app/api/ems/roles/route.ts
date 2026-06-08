import { NextRequest } from 'next/server'
import { successResponse, errorResponse } from '@/lib/errorHandler'
import { getUserIdFromToken } from '@/lib/jwt'
import { getUserTenantScope } from '@/middleware/tenantFilter'
import { requireMenuAccessAppRouter } from '@/lib/menuAccessAppRouter'
import { ems } from '@/lib/supabase'
import { dataCache } from '@/lib/cache/dataCache'

const CACHE_TTL = 5 * 60 * 1000

export async function GET(req: NextRequest) {
  try {
    const userId = await getUserIdFromToken(req)
    if (!userId) return errorResponse(null, 'Unauthorized', 401)

    const menuAccess = await requireMenuAccessAppRouter(req, 'ems.settings')
    if (menuAccess instanceof Response) return menuAccess

    const scope = await getUserTenantScope(userId)
    if (!scope.companyId) return errorResponse(null, 'Company context required', 403)

    const cacheKey = `ems_dynamic_roles:${scope.companyId}`
    const cached = await dataCache.get(cacheKey)
    if (cached) return successResponse(cached, 'Roles fetched successfully (cached)')

    const { data, error } = await ems.dynamicRoles()
      .select('id, role_name, description, menu_ids, is_active, created_at, updated_at')
      .eq('company_id', scope.companyId)
      .order('created_at', { ascending: false })

    if (error) {
      if (error.code === '42501') {
        return successResponse([], 'Permission for dynamic roles not available')
      }
      return errorResponse(null, error.message, 500)
    }

    const { data: counts, error: countError } = await ems.dynamicUserRoles()
      .select('role_id, id', { count: 'exact', head: false })

    const userCounts: Record<number, number> = {}
    if (counts && !countError) {
      for (const row of counts) {
        userCounts[row.role_id] = (userCounts[row.role_id] || 0) + 1
      }
    }

    const roles = (data || []).map(r => ({
      ...r,
      user_count: userCounts[r.id] || 0
    }))

    await dataCache.set(cacheKey, roles, CACHE_TTL)
    return successResponse(roles, 'Roles fetched successfully')
  } catch (error: any) {
    return errorResponse(null, error.message || 'Failed to fetch roles', 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await getUserIdFromToken(req)
    if (!userId) return errorResponse(null, 'Unauthorized', 401)

    const menuAccess = await requireMenuAccessAppRouter(req, 'ems.settings')
    if (menuAccess instanceof Response) return menuAccess

    const scope = await getUserTenantScope(userId)
    if (!scope.companyId) return errorResponse(null, 'Company context required', 403)

    const body = await req.json()
    const { role_name, description, menu_ids } = body

    if (!role_name || !role_name.trim()) {
      return errorResponse(null, 'Role name is required', 400)
    }

    const { data, error } = await ems.dynamicRoles()
      .insert({
        company_id: scope.companyId,
        role_name: role_name.trim(),
        description: description || null,
        menu_ids: menu_ids || [],
        created_by: userId
      })
      .select('id, role_name, description, menu_ids, is_active, created_at')
      .single()

    if (error) {
      if (error.code === '23505') {
        return errorResponse(null, 'A role with this name already exists', 409)
      }
      if (error.code === '42501') {
        return errorResponse(null, 'Database permissions not configured. Run the GRANT SQL first.', 500)
      }
      return errorResponse(null, error.message, 500)
    }

    return successResponse(data, 'Role created successfully', 201)
  } catch (error: any) {
    return errorResponse(null, error.message || 'Failed to create role', 500)
  }
}
