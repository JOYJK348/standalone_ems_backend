import { NextRequest } from 'next/server'
import { successResponse, errorResponse } from '@/lib/errorHandler'
import { getUserIdFromToken } from '@/lib/jwt'
import { getUserTenantScope } from '@/middleware/tenantFilter'
import { requireMenuAccessAppRouter } from '@/lib/menuAccessAppRouter'
import { fromSchema } from '@/lib/supabase'
import { SCHEMAS } from '@/config/constants'
import { dataCache } from '@/lib/cache/dataCache'

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
    const id = searchParams.get('id')
    const category = searchParams.get('category')
    const startDate = searchParams.get('start_date')
    const endDate = searchParams.get('end_date')
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20')))
    const offset = (page - 1) * limit

    if (id) {
      const { data, error } = await fromSchema(SCHEMAS.EMS, 'expenses')
        .select('*')
        .eq('id', id)
        .is('deleted_at', null)
        .single()

      if (error) {
        if (isMissingTableErr(error)) return errorResponse(null, 'Expenses table not yet created — run migration', 500)
        return errorResponse(null, 'Expense not found', 404)
      }
      return successResponse(data, 'Expense fetched successfully')
    }

    let dataQuery = fromSchema(SCHEMAS.EMS, 'expenses')
      .select('*', { count: 'exact' })
      .eq('company_id', scope.companyId)
      .is('deleted_at', null)
      .order('expense_date', { ascending: false })

    let countQuery = fromSchema(SCHEMAS.EMS, 'expenses')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', scope.companyId)
      .is('deleted_at', null)

    if (category) {
      dataQuery = dataQuery.eq('category', category)
      countQuery = countQuery.eq('category', category)
    }
    if (startDate) {
      dataQuery = dataQuery.gte('expense_date', startDate)
      countQuery = countQuery.gte('expense_date', startDate)
    }
    if (endDate) {
      dataQuery = dataQuery.lte('expense_date', endDate)
      countQuery = countQuery.lte('expense_date', endDate)
    }

    const [{ data, error, count }, countResult] = await Promise.all([
      dataQuery.range(offset, offset + limit - 1),
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
    }, 'Expenses fetched successfully')
  } catch (error: any) {
    console.error('[Expenses GET] Error:', error.message)
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
    const { category, amount, expense_date, description, payment_mode, vendor_name, vendor_gstin, receipt_url, gst_input, is_recurring, recurring_frequency, next_due_date } = body

    if (!category || !amount || !expense_date) {
      return errorResponse(null, 'category, amount, and expense_date are required', 400)
    }

    const { data, error } = await fromSchema(SCHEMAS.EMS, 'expenses')
      .insert({
        company_id: scope.companyId,
        category,
        amount,
        expense_date,
        description: description || null,
        payment_mode: payment_mode || null,
        vendor_name: vendor_name || null,
        vendor_gstin: vendor_gstin || null,
        receipt_url: receipt_url || null,
        gst_input: gst_input || 0,
        is_recurring: is_recurring || false,
        recurring_frequency: recurring_frequency || null,
        next_due_date: next_due_date || null,
        created_by: userId
      })
      .select()
      .single()

    if (error) return errorResponse(null, error.message, 500)

    await dataCache.invalidate(`ems_dashboard_stats:${scope.companyId}`)

    return successResponse(data, 'Expense recorded successfully')
  } catch (error: any) {
    console.error('[Expenses POST] Error:', error.message)
    return errorResponse(null, error.message, 500)
  }
}

export async function PUT(req: NextRequest) {
  try {
    const userId = await getUserIdFromToken(req)
    if (!userId) return errorResponse(null, 'Unauthorized', 401)

    const menuAccess = await requireMenuAccessAppRouter(req, 'ems.finance.fees')
    if (menuAccess instanceof Response) return menuAccess

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return errorResponse(null, 'Expense ID is required', 400)

    const scope = await getUserTenantScope(userId)
    if (!scope?.companyId) return errorResponse(null, 'Company context not found', 400)

    const body = await req.json()
    const updateData: Record<string, any> = { updated_at: new Date().toISOString() }
    if (body.category !== undefined) updateData.category = body.category
    if (body.amount !== undefined) updateData.amount = body.amount
    if (body.expense_date !== undefined) updateData.expense_date = body.expense_date
    if (body.description !== undefined) updateData.description = body.description
    if (body.payment_mode !== undefined) updateData.payment_mode = body.payment_mode
    if (body.vendor_name !== undefined) updateData.vendor_name = body.vendor_name
    if (body.gst_input !== undefined) updateData.gst_input = body.gst_input

    const { data, error } = await fromSchema(SCHEMAS.EMS, 'expenses')
      .update(updateData)
      .eq('id', id)
      .eq('company_id', scope.companyId)
      .select()
      .single()

    if (error) return errorResponse(null, error.message, 500)

    await dataCache.invalidate(`ems_dashboard_stats:${scope.companyId}`)

    return successResponse(data, 'Expense updated successfully')
  } catch (error: any) {
    console.error('[Expenses PUT] Error:', error.message)
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
    if (!id) return errorResponse(null, 'Expense ID is required', 400)

    const { error } = await fromSchema(SCHEMAS.EMS, 'expenses')
      .update({ deleted_at: new Date().toISOString(), deleted_by: userId })
      .eq('id', id)
      .eq('company_id', scope.companyId)

    if (error) return errorResponse(null, error.message, 500)

    await dataCache.invalidate(`ems_dashboard_stats:${scope.companyId}`)

    return successResponse(null, 'Expense deleted successfully')
  } catch (error: any) {
    console.error('[Expenses DELETE] Error:', error.message)
    return errorResponse(null, error.message, 500)
  }
}
