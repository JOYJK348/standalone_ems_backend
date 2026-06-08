import { NextRequest } from 'next/server'
import { successResponse, errorResponse } from '@/lib/errorHandler'
import { getUserIdFromToken } from '@/lib/jwt'
import { getUserTenantScope } from '@/middleware/tenantFilter'
import { getUserMenuIdsAppRouter } from '@/lib/menuAccessAppRouter'

export async function GET(req: NextRequest) {
  try {
    const userId = await getUserIdFromToken(req)
    if (!userId) return errorResponse(null, 'Unauthorized', 401)

    const scope = await getUserTenantScope(userId)
    if (!scope) return errorResponse(null, 'No tenant scope', 403)

    const menuIds = await getUserMenuIdsAppRouter(userId, scope.companyId)

    return successResponse(
      {
        menuIds,
        roleName: scope.roleName,
        roleLevel: scope.roleLevel,
        companyId: scope.companyId,
        branchId: scope.branchId
      },
      'User menus fetched successfully'
    )
  } catch (error: any) {
    console.error('[MyMenus] Error:', error.message)
    return errorResponse(null, error.message || 'Failed to fetch user menus', 500)
  }
}
