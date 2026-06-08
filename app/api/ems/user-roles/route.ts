import { NextRequest } from 'next/server'
import { successResponse, errorResponse } from '@/lib/errorHandler'
import { getUserIdFromToken } from '@/lib/jwt'
import { getUserTenantScope } from '@/middleware/tenantFilter'
import { requireMenuAccessAppRouter } from '@/lib/menuAccessAppRouter'
import { ems } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  try {
    const userId = await getUserIdFromToken(req)
    if (!userId) return errorResponse(null, 'Unauthorized', 401)

    const menuAccess = await requireMenuAccessAppRouter(req, 'ems.settings')
    if (menuAccess instanceof Response) return menuAccess

    const scope = await getUserTenantScope(userId)
    if (!scope.companyId) return errorResponse(null, 'Company context required', 403)

    const { data, error } = await ems.dynamicUserRoles()
      .select('id, user_id, role_id, is_active, assigned_at, dynamic_roles!inner(role_name)')
      .eq('company_id', scope.companyId)
      .order('assigned_at', { ascending: false })

    if (error) {
      if (error.code === '42501') return successResponse([], 'Permissions not configured')
      return errorResponse(null, error.message, 500)
    }
    return successResponse(data || [], 'User roles fetched successfully')
  } catch (error: any) {
    return errorResponse(null, error.message || 'Failed to fetch user roles', 500)
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
    const { user_id, role_id } = body

    if (!user_id || !role_id) {
      return errorResponse(null, 'user_id and role_id are required', 400)
    }

    const { data, error } = await ems.dynamicUserRoles()
      .insert({
        user_id,
        role_id,
        company_id: scope.companyId,
        assigned_by: userId
      })
      .select('id, user_id, role_id, assigned_at')
      .single()

    if (error) {
      if (error.code === '23505') {
        return errorResponse(null, 'User already has this role assigned', 409)
      }
      if (error.code === '42501') {
        return errorResponse(null, 'Permissions not configured for dynamic_user_roles', 500)
      }
      return errorResponse(null, error.message, 500)
    }

    return successResponse(data, 'Role assigned successfully', 201)
  } catch (error: any) {
    return errorResponse(null, error.message || 'Failed to assign role', 500)
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const userId = await getUserIdFromToken(req)
    if (!userId) return errorResponse(null, 'Unauthorized', 401)

    const menuAccess = await requireMenuAccessAppRouter(req, 'ems.settings')
    if (menuAccess instanceof Response) return menuAccess

    const scope = await getUserTenantScope(userId)
    if (!scope.companyId) return errorResponse(null, 'Company context required', 403)

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')

    if (!id) return errorResponse(null, 'User role ID is required', 400)

    const { error } = await ems.dynamicUserRoles()
      .delete()
      .eq('id', id)
      .eq('company_id', scope.companyId)

    if (error) {
      if (error.code === '42501') return errorResponse(null, 'Permissions not configured', 500)
      return errorResponse(null, error.message, 500)
    }
    return successResponse(null, 'Role unassigned successfully')
  } catch (error: any) {
    return errorResponse(null, error.message || 'Failed to unassign role', 500)
  }
}
