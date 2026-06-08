import { NextRequest } from 'next/server'
import { successResponse, errorResponse } from '@/lib/errorHandler'
import { getUserIdFromToken } from '@/lib/jwt'
import { getUserTenantScope } from '@/middleware/tenantFilter'
import { requireMenuAccessAppRouter } from '@/lib/menuAccessAppRouter'
import { ems } from '@/lib/supabase'
import { dataCache } from '@/lib/cache/dataCache'

const CACHE_TTL = 5 * 60 * 1000

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = await getUserIdFromToken(req)
    if (!userId) return errorResponse(null, 'Unauthorized', 401)

    const menuAccess = await requireMenuAccessAppRouter(req, 'ems.settings')
    if (menuAccess instanceof Response) return menuAccess

    const scope = await getUserTenantScope(userId)
    if (!scope.companyId) return errorResponse(null, 'Company context required', 403)

    const cacheKey = `ems_dynamic_role:${params.id}:${scope.companyId}`
    const cached = await dataCache.get(cacheKey)
    if (cached) return successResponse(cached, 'Role fetched successfully (cached)')

    const { data, error } = await ems.dynamicRoles()
      .select('*')
      .eq('id', params.id)
      .eq('company_id', scope.companyId)
      .single()

    if (error) {
      if (error.code === '42501') return errorResponse(null, 'Permissions not configured', 500)
      return errorResponse(null, 'Role not found', 404)
    }
    await dataCache.set(cacheKey, data, CACHE_TTL)
    return successResponse(data, 'Role fetched successfully')
  } catch (error: any) {
    return errorResponse(null, error.message || 'Failed to fetch role', 500)
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = await getUserIdFromToken(req)
    if (!userId) return errorResponse(null, 'Unauthorized', 401)

    const menuAccess = await requireMenuAccessAppRouter(req, 'ems.settings')
    if (menuAccess instanceof Response) return menuAccess

    const scope = await getUserTenantScope(userId)
    if (!scope.companyId) return errorResponse(null, 'Company context required', 403)

    const body = await req.json()
    const updates: Record<string, any> = {}

    if (body.role_name !== undefined) updates.role_name = body.role_name
    if (body.description !== undefined) updates.description = body.description
    if (body.menu_ids !== undefined) updates.menu_ids = body.menu_ids
    if (body.is_active !== undefined) updates.is_active = body.is_active

    const { data, error } = await ems.dynamicRoles()
      .update(updates)
      .eq('id', params.id)
      .eq('company_id', scope.companyId)
      .select('id, role_name, description, menu_ids, is_active')
      .single()

    if (error) {
      if (error.code === '23505') return errorResponse(null, 'A role with this name already exists', 409)
      if (error.code === '42501') return errorResponse(null, 'Permissions not configured', 500)
      return errorResponse(null, error.message, 500)
    }
    return successResponse(data, 'Role updated successfully')
  } catch (error: any) {
    return errorResponse(null, error.message || 'Failed to update role', 500)
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = await getUserIdFromToken(req)
    if (!userId) return errorResponse(null, 'Unauthorized', 401)

    const menuAccess = await requireMenuAccessAppRouter(req, 'ems.settings')
    if (menuAccess instanceof Response) return menuAccess

    const scope = await getUserTenantScope(userId)
    if (!scope.companyId) return errorResponse(null, 'Company context required', 403)

    const { error } = await ems.dynamicRoles()
      .delete()
      .eq('id', params.id)
      .eq('company_id', scope.companyId)

    if (error) {
      if (error.code === '42501') return errorResponse(null, 'Permissions not configured', 500)
      return errorResponse(null, error.message, 500)
    }
    return successResponse(null, 'Role deleted successfully')
  } catch (error: any) {
    return errorResponse(null, error.message || 'Failed to delete role', 500)
  }
}
