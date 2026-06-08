import { NextRequest } from 'next/server'
import { successResponse, errorResponse } from '@/lib/errorHandler'
import { getUserIdFromToken } from '@/lib/jwt'
import { getUserTenantScope } from '@/middleware/tenantFilter'
import { requireMenuAccessAppRouter } from '@/lib/menuAccessAppRouter'
import { app_auth, core } from '@/lib/supabase'
import { dataCache } from '@/lib/cache/dataCache'

const CACHE_TTL = 30 * 1000

export async function GET(req: NextRequest) {
  try {
    const userId = await getUserIdFromToken(req)
    if (!userId) return errorResponse(null, 'Unauthorized', 401)

    const menuAccess = await requireMenuAccessAppRouter(req, 'ems.settings')
    if (menuAccess instanceof Response) return menuAccess

    const scope = await getUserTenantScope(userId)
    if (!scope.companyId) return errorResponse(null, 'Company context required', 403)

    const cacheKey = `ems_users:${scope.companyId}`
    const cached = await dataCache.get(cacheKey)
    if (cached) return successResponse(cached, 'Users fetched successfully (cached)')

    const { data: employees, error: empError } = await core.employees()
      .select('user_id, first_name, last_name, email, is_active')
      .not('user_id', 'is', null)
      .eq('company_id', scope.companyId)
      .is('deleted_at', null)
      .order('first_name', { ascending: true })

    if (empError) return errorResponse(null, empError.message, 500)

    const users = (employees || []).map(emp => ({
      id: emp.user_id,
      name: `${emp.first_name || ''} ${emp.last_name || ''}`.trim(),
      email: emp.email || '',
      is_active: emp.is_active
    }))

    await dataCache.set(cacheKey, users, CACHE_TTL)
    return successResponse(users, 'Users fetched successfully')
  } catch (error: any) {
    return errorResponse(null, error.message || 'Failed to fetch users', 500)
  }
}
