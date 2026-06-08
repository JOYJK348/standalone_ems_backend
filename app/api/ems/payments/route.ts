import { NextRequest } from 'next/server'
import { successResponse, errorResponse } from '@/lib/errorHandler'
import { getUserIdFromToken } from '@/lib/jwt'
import { getUserTenantScope } from '@/middleware/tenantFilter'
import { requireMenuAccessAppRouter } from '@/lib/menuAccessAppRouter'
import { ems } from '@/lib/supabase'
import { dataCache } from '@/lib/cache/dataCache'

export async function GET(req: NextRequest) {
  try {
    const userId = await getUserIdFromToken(req)
    if (!userId) return errorResponse(null, 'Unauthorized', 401)

    const menuAccess = await requireMenuAccessAppRouter(req, 'ems.finance.payments')
    if (menuAccess instanceof Response) return menuAccess

    const scope = await getUserTenantScope(userId)
    if (!scope?.companyId) return errorResponse(null, 'Company context not found', 400)

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20')))
    const offset = (page - 1) * limit
    const status = searchParams.get('status')

    if (id) {
      const { data, error } = await ems.feePayments()
        .select('*, students!inner(id, first_name, last_name, email, phone)')
        .eq('id', id)
        .single()
      if (error) return errorResponse(null, 'Payment not found', 404)
      return successResponse(data, 'Payment fetched successfully')
    }

    let countQuery = ems.feePayments()
      .select('id', { count: 'exact', head: true })
      .eq('company_id', scope.companyId)

    let dataQuery = ems.feePayments()
      .select('*, students!inner(id, first_name, last_name, email, phone)')
      .eq('company_id', scope.companyId)

    if (status) {
      countQuery = countQuery.eq('payment_status', status)
      dataQuery = dataQuery.eq('payment_status', status)
    }

    const [{ data, error, count }, countResult] = await Promise.all([
      dataQuery.order('created_at', { ascending: false }).range(offset, offset + limit - 1),
      countQuery
    ])

    if (error) return errorResponse(null, error.message, 500)

    return successResponse({
      data: data || [],
      pagination: {
        page,
        limit,
        total: countResult.count ?? count ?? 0,
        totalPages: Math.ceil((countResult.count ?? count ?? 0) / limit)
      }
    }, 'Payments fetched successfully')
  } catch (error: any) {
    console.error('[Payments GET] Error:', error.message)
    return errorResponse(null, error.message, 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await getUserIdFromToken(req)
    if (!userId) return errorResponse(null, 'Unauthorized', 401)

    const menuAccess = await requireMenuAccessAppRouter(req, 'ems.finance.payments')
    if (menuAccess instanceof Response) return menuAccess

    const scope = await getUserTenantScope(userId)
    if (!scope?.companyId) return errorResponse(null, 'Company context not found', 400)

    const body = await req.json()
    const { student_id, enrollment_id, fee_structure_id, amount_paid, payment_method, transaction_id, remarks } = body

    if (!student_id || !amount_paid) {
      return errorResponse(null, 'student_id and amount_paid are required', 400)
    }

    const receiptNumber = `RCP-${Date.now().toString(36).toUpperCase()}`

    const { data, error } = await ems.feePayments().insert({
      company_id: scope.companyId,
      student_id,
      enrollment_id: enrollment_id || null,
      fee_structure_id: fee_structure_id || null,
      amount_paid,
      payment_method: payment_method || 'CASH',
      transaction_id: transaction_id || null,
      payment_status: 'COMPLETED',
      receipt_number: receiptNumber,
      remarks: remarks || null,
      received_by: userId
    }).select().single()

    if (error) return errorResponse(null, error.message, 500)

    await dataCache.invalidate(`ems_dashboard_stats:${scope.companyId}`)

    return successResponse(data, 'Payment recorded successfully')
  } catch (error: any) {
    console.error('[Payments POST] Error:', error.message)
    return errorResponse(null, error.message, 500)
  }
}

export async function PUT(req: NextRequest) {
  try {
    const userId = await getUserIdFromToken(req)
    if (!userId) return errorResponse(null, 'Unauthorized', 401)

    const menuAccess = await requireMenuAccessAppRouter(req, 'ems.finance.payments')
    if (menuAccess instanceof Response) return menuAccess

    const scope = await getUserTenantScope(userId)
    if (!scope?.companyId) return errorResponse(null, 'Company context not found', 400)

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return errorResponse(null, 'Payment ID is required', 400)

    const body = await req.json()
    const updateData: Record<string, any> = { updated_at: new Date().toISOString() }
    if (body.amount_paid !== undefined) updateData.amount_paid = body.amount_paid
    if (body.payment_method !== undefined) updateData.payment_method = body.payment_method
    if (body.transaction_id !== undefined) updateData.transaction_id = body.transaction_id
    if (body.remarks !== undefined) updateData.remarks = body.remarks

    const { data, error } = await ems.feePayments()
      .update(updateData)
      .eq('id', id)
      .eq('company_id', scope.companyId)
      .select()
      .single()

    if (error) return errorResponse(null, error.message, 500)

    await dataCache.invalidate(`ems_dashboard_stats:${scope.companyId}`)

    return successResponse(data, 'Payment updated successfully')
  } catch (error: any) {
    console.error('[Payments PUT] Error:', error.message)
    return errorResponse(null, error.message, 500)
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const userId = await getUserIdFromToken(req)
    if (!userId) return errorResponse(null, 'Unauthorized', 401)

    const menuAccess = await requireMenuAccessAppRouter(req, 'ems.finance.payments')
    if (menuAccess instanceof Response) return menuAccess

    const scope = await getUserTenantScope(userId)
    if (!scope?.companyId) return errorResponse(null, 'Company context not found', 400)

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return errorResponse(null, 'Payment ID is required', 400)

    // Soft-void: mark payment as voided instead of hard delete
    const { error } = await ems.feePayments()
      .update({
        payment_status: 'VOIDED',
        remarks: 'Payment voided',
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('company_id', scope.companyId)

    if (error) return errorResponse(null, error.message, 500)

    await dataCache.invalidate(`ems_dashboard_stats:${scope.companyId}`)

    return successResponse(null, 'Payment voided successfully')
  } catch (error: any) {
    console.error('[Payments DELETE] Error:', error.message)
    return errorResponse(null, error.message, 500)
  }
}
