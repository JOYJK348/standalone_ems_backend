import { NextRequest } from 'next/server'
import { successResponse, errorResponse } from '@/lib/errorHandler'
import { getUserIdFromToken } from '@/lib/jwt'
import { getUserTenantScope } from '@/middleware/tenantFilter'
import { getUserMenuIdsAppRouter } from '@/lib/menuAccessAppRouter'
import { dataCache } from '@/lib/cache/dataCache'

const CACHE_TTL = 5 * 60 * 1000

export async function GET(req: NextRequest) {
  try {
    const userId = await getUserIdFromToken(req)
    if (!userId) return errorResponse(null, 'Unauthorized', 401)

    const scope = await getUserTenantScope(userId)
    if (!scope) return errorResponse(null, 'No tenant scope', 403)

    const cacheKey = `ems_my_menus:${userId}:${scope.companyId}`
    const cached = await dataCache.get(cacheKey)
    if (cached) return successResponse(cached, 'User menus fetched successfully (cached)')

    const menuIds = await getUserMenuIdsAppRouter(userId, scope.companyId)

    const responseData = {
      menuIds,
      roleName: scope.roleName,
      roleLevel: scope.roleLevel,
      companyId: scope.companyId,
      branchId: scope.branchId
    }

    await dataCache.set(cacheKey, responseData, CACHE_TTL)
    return successResponse(responseData, 'User menus fetched successfully')
  } catch (error: any) {
    console.error('[MyMenus] Error:', error.message)
    return errorResponse(null, error.message || 'Failed to fetch user menus', 500)
  }
}
