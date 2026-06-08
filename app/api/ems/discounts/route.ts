import { NextRequest } from 'next/server'
import { successResponse, errorResponse } from '@/lib/errorHandler'
import { getUserIdFromToken } from '@/lib/jwt'
import { getUserTenantScope } from '@/middleware/tenantFilter'
import { requireMenuAccessAppRouter } from '@/lib/menuAccessAppRouter'
import { fromSchema } from '@/lib/supabase'
import { SCHEMAS } from '@/config/constants'
import { dataCache } from '@/lib/cache/dataCache'

const CACHE_TTL = 60 * 1000

function isMissingTableErr(err: { message?: string; code?: string } | null): boolean {
  if (!err) return false
  return !!(err.message?.includes('relation') || err.code === '42P01' || err.message?.includes('permission denied'))
}

export async function GET(req: NextRequest) {
  try {
    const userId = await getUserIdFromToken(req)
    if (!userId) return errorResponse(null, 'Unauthorized', 401)

    const menuAccess = await requireMenuAccessAppRouter(req, 'ems.finance.fees')
    if (menuAccess instanceof Response) return menuAccess

    const scope = await getUserTenantScope(userId)
    if (!scope?.companyId) return errorResponse(null, 'Company context not found', 400)

    const { searchParams } = new URL(req.url)
    const studentId = searchParams.get('student_id')

    const cacheKey = `ems_discounts:${scope.companyId}:${studentId || 'all'}`
    const cached = await dataCache.get(cacheKey)
    if (cached) return successResponse(cached, 'Discounts fetched successfully (cached)')

    let query = fromSchema(SCHEMAS.EMS, 'discounts')
      .select('*, students!inner(id, company_id, first_name, last_name, student_code)')
      .eq('students.company_id', scope.companyId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })

    if (studentId) {
      query = query.eq('student_id', studentId)
    }

    const { data, error } = await query

    if (error) {
      if (isMissingTableErr(error)) return successResponse([], 'Discounts table not yet created — run migration')
      return errorResponse(null, error.message, 500)
    }
    await dataCache.set(cacheKey, data || [], CACHE_TTL)
    return successResponse(data || [], 'Discounts fetched successfully')
  } catch (error: any) {
    console.error('[Discounts GET] Error:', error.message)
    return errorResponse(null, error.message, 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await getUserIdFromToken(req)
    if (!userId) return errorResponse(null, 'Unauthorized', 401)

    const menuAccess = await requireMenuAccessAppRouter(req, 'ems.finance.fees')
    if (menuAccess instanceof Response) return menuAccess

    const scope = await getUserTenantScope(userId)
    if (!scope?.companyId) return errorResponse(null, 'Company context not found', 400)

    const body = await req.json()
    const { student_id, fee_structure_id, discount_type, percentage, amount, reason } = body

    if (!student_id || !fee_structure_id || !discount_type) {
      return errorResponse(null, 'student_id, fee_structure_id, and discount_type are required', 400)
    }

    const { data, error } = await fromSchema(SCHEMAS.EMS, 'discounts')
      .insert({
        student_id,
        fee_structure_id,
        company_id: scope.companyId,
        discount_type,
        percentage: percentage || null,
        amount: amount || null,
        reason: reason || null,
        approved_by: userId
      })
      .select()
      .single()

    if (error) {
      console.error('[Discounts POST] DB Error:', JSON.stringify(error))
      if (isMissingTableErr(error)) return errorResponse(null, 'Discounts table not yet created — run migration', 500)
      return errorResponse(null, error.message, 500)
    }
    return successResponse(data, 'Discount created successfully')
  } catch (error: any) {
    console.error('[Discounts POST] Error:', error.message, error.stack)
    return errorResponse(null, error.message, 500)
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const userId = await getUserIdFromToken(req)
    if (!userId) return errorResponse(null, 'Unauthorized', 401)

    const menuAccess = await requireMenuAccessAppRouter(req, 'ems.finance.fees')
    if (menuAccess instanceof Response) return menuAccess

    const scope = await getUserTenantScope(userId)
    if (!scope?.companyId) return errorResponse(null, 'Company context not found', 400)

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return errorResponse(null, 'Discount ID is required', 400)

    const { data: discount, error: fetchErr } = await fromSchema(SCHEMAS.EMS, 'discounts')
      .select('*, students!inner(company_id)')
      .eq('id', id)
      .eq('students.company_id', scope.companyId)
      .single()

    if (fetchErr || !discount) return errorResponse(null, 'Discount not found', 404)

    const { error } = await fromSchema(SCHEMAS.EMS, 'discounts')
      .update({ is_active: false })
      .eq('id', id)

    if (error) return errorResponse(null, error.message, 500)
    return successResponse(null, 'Discount deactivated successfully')
  } catch (error: any) {
    console.error('[Discounts DELETE] Error:', error.message)
    return errorResponse(null, error.message, 500)
  }
}
