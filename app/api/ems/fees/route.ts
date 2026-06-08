import { NextRequest } from 'next/server'
import { successResponse, errorResponse } from '@/lib/errorHandler'
import { getUserIdFromToken } from '@/lib/jwt'
import { getUserTenantScope } from '@/middleware/tenantFilter'
import { requireMenuAccessAppRouter } from '@/lib/menuAccessAppRouter'
import { ems } from '@/lib/supabase'
import { dataCache } from '@/lib/cache/dataCache'

const CACHE_TTL = 60 * 1000

export async function GET(req: NextRequest) {
  try {
    const userId = await getUserIdFromToken(req)
    if (!userId) return errorResponse(null, 'Unauthorized', 401)

    const menuAccess = await requireMenuAccessAppRouter(req, 'ems.finance.fees')
    if (menuAccess instanceof Response) return menuAccess

    const scope = await getUserTenantScope(userId)
    if (!scope?.companyId) return errorResponse(null, 'Company context not found', 400)

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20')))
    const offset = (page - 1) * limit
    const courseId = searchParams.get('course_id')
    const activeOnly = searchParams.get('active') !== 'false'

    const cacheKey = `ems_fees:${scope.companyId}:${id || 'list'}:${courseId || 'all'}:${page}:${limit}:${activeOnly}`
    if (!id) {
      const cached = await dataCache.get(cacheKey)
      if (cached) return successResponse(cached, 'Fee structures fetched successfully (cached)')
    }

    if (id) {
      const { data, error } = await ems.feeStructure()
        .select('*, courses!inner(id, course_name, course_code)')
        .eq('id', id)
        .is('deleted_at', null)
        .single()
      if (error) return errorResponse(null, 'Fee structure not found', 404)
      return successResponse(data, 'Fee structure fetched successfully')
    }

    let countQuery = ems.feeStructure()
      .select('id', { count: 'exact', head: true })
      .eq('company_id', scope.companyId)
      .is('deleted_at', null)

    let dataQuery = ems.feeStructure()
      .select('*, courses!inner(id, course_name, course_code)')
      .eq('company_id', scope.companyId)
      .is('deleted_at', null)

    if (courseId) {
      countQuery = countQuery.eq('course_id', courseId)
      dataQuery = dataQuery.eq('course_id', courseId)
    }

    if (activeOnly) {
      countQuery = countQuery.eq('is_active', true)
      dataQuery = dataQuery.eq('is_active', true)
    }

    const [{ data, error, count }, countResult] = await Promise.all([
      dataQuery.order('created_at', { ascending: false }).range(offset, offset + limit - 1),
      countQuery
    ])

    if (error) return errorResponse(null, error.message, 500)

    const responseData = {
      data: data || [],
      pagination: {
        page,
        limit,
        total: countResult.count ?? count ?? 0,
        totalPages: Math.ceil((countResult.count ?? count ?? 0) / limit)
      }
    }

    await dataCache.set(cacheKey, responseData, CACHE_TTL)
    return successResponse(responseData, 'Fee structures fetched successfully')
  } catch (error: any) {
    console.error('[Fees GET] Error:', error.message)
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
    const { course_id, fee_name, fee_type, amount, due_date, is_mandatory } = body

    if (!course_id || !fee_name || !amount) {
      return errorResponse(null, 'course_id, fee_name, and amount are required', 400)
    }

    const { data, error } = await ems.feeStructure().insert({
      company_id: scope.companyId,
      course_id,
      fee_name,
      fee_type: fee_type || 'TUITION',
      amount,
      due_date: due_date || null,
      is_mandatory: is_mandatory !== false,
      created_by: userId
    }).select().single()

    if (error) return errorResponse(null, error.message, 500)
    return successResponse(data, 'Fee structure created successfully')
  } catch (error: any) {
    console.error('[Fees POST] Error:', error.message)
    return errorResponse(null, error.message, 500)
  }
}

export async function PUT(req: NextRequest) {
  try {
    const userId = await getUserIdFromToken(req)
    if (!userId) return errorResponse(null, 'Unauthorized', 401)

    const menuAccess = await requireMenuAccessAppRouter(req, 'ems.finance.fees')
    if (menuAccess instanceof Response) return menuAccess

    const scope = await getUserTenantScope(userId)
    if (!scope?.companyId) return errorResponse(null, 'Company context not found', 400)

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return errorResponse(null, 'Fee structure ID is required', 400)

    const body = await req.json()
    const updateData: Record<string, any> = { updated_at: new Date().toISOString() }
    if (body.fee_name !== undefined) updateData.fee_name = body.fee_name
    if (body.fee_type !== undefined) updateData.fee_type = body.fee_type
    if (body.amount !== undefined) updateData.amount = body.amount
    if (body.due_date !== undefined) updateData.due_date = body.due_date
    if (body.is_mandatory !== undefined) updateData.is_mandatory = body.is_mandatory
    if (body.is_active !== undefined) updateData.is_active = body.is_active

    const { data, error } = await ems.feeStructure()
      .update(updateData)
      .eq('id', id)
      .eq('company_id', scope.companyId)
      .select()
      .single()

    if (error) return errorResponse(null, error.message, 500)
    return successResponse(data, 'Fee structure updated successfully')
  } catch (error: any) {
    console.error('[Fees PUT] Error:', error.message)
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
    if (!id) return errorResponse(null, 'Fee structure ID is required', 400)

    const { error } = await ems.feeStructure()
      .update({ deleted_at: new Date().toISOString(), deleted_by: userId })
      .eq('id', id)
      .eq('company_id', scope.companyId)

    if (error) return errorResponse(null, error.message, 500)
    return successResponse(null, 'Fee structure deleted successfully')
  } catch (error: any) {
    console.error('[Fees DELETE] Error:', error.message)
    return errorResponse(null, error.message, 500)
  }
}
