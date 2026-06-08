import { NextRequest } from 'next/server'
import { successResponse, errorResponse } from '@/lib/errorHandler'
import { getUserIdFromToken } from '@/lib/jwt'
import { getUserTenantScope } from '@/middleware/tenantFilter'
import { requireMenuAccessAppRouter } from '@/lib/menuAccessAppRouter'
import { fromSchema } from '@/lib/supabase'
import { SCHEMAS } from '@/config/constants'
import { dataCache } from '@/lib/cache/dataCache'

const TABLE = 'invoices'

function isMissingTableErr(err: { message?: string; code?: string } | null): boolean {
  if (!err) return false
  return !!(err.message?.includes('relation') || err.code === '42P01' || err.message?.includes('permission denied'))
}

export async function GET(req: NextRequest) {
  try {
    const userId = await getUserIdFromToken(req)
    if (!userId) return errorResponse(null, 'Unauthorized', 401)

    const menuAccess = await requireMenuAccessAppRouter(req, 'ems.finance.invoices')
    if (menuAccess instanceof Response) return menuAccess

    const scope = await getUserTenantScope(userId)
    if (!scope?.companyId) return errorResponse(null, 'Company context not found', 400)

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20')))
    const offset = (page - 1) * limit
    const status = searchParams.get('status')
    const search = searchParams.get('search')

    try {
      if (id) {
        const { data, error } = await fromSchema(SCHEMAS.EMS, TABLE)
          .select('*')
          .eq('id', id)
          .is('deleted_at', null)
          .single()
        if (error) {
          if (isMissingTableErr(error)) return successResponse(null, 'Invoices table not yet created — run migration')
          return errorResponse(null, 'Invoice not found', 404)
        }
        return successResponse(data, 'Invoice fetched successfully')
      }

      let query = fromSchema(SCHEMAS.EMS, TABLE)
        .select('*', { count: 'exact' })
        .eq('company_id', scope.companyId)
        .is('deleted_at', null)

      if (status) query = query.eq('status', status)
      if (search) query = query.ilike('invoice_number', `%${search}%`)

      const countQuery = fromSchema(SCHEMAS.EMS, TABLE)
        .select('id', { count: 'exact', head: true })
        .eq('company_id', scope.companyId)
        .is('deleted_at', null)

      if (search) countQuery.ilike('invoice_number', `%${search}%`)

      const [{ data, error, count }, countResult] = await Promise.all([
        query.order('created_at', { ascending: false }).range(offset, offset + limit - 1),
        countQuery
      ])

      if (error) {
        if (isMissingTableErr(error)) return successResponse({ data: [], pagination: { page, limit, total: 0, totalPages: 0 } }, 'Invoices table not yet created — returning empty')
        return errorResponse(null, error.message, 500)
      }

      return successResponse({
        data: data || [],
        pagination: {
          page,
          limit,
          total: countResult.count ?? count ?? 0,
          totalPages: Math.ceil((countResult.count ?? count ?? 0) / limit)
        }
      }, 'Invoices fetched successfully')
    } catch (tableErr: any) {
      if (isMissingTableErr(tableErr)) return successResponse({ data: [], pagination: { page, limit, total: 0, totalPages: 0 } }, 'Invoices table not yet created — returning empty')
      throw tableErr
    }
  } catch (error: any) {
    console.error('[Invoices GET] Error:', error.message)
    return errorResponse(null, error.message, 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await getUserIdFromToken(req)
    if (!userId) return errorResponse(null, 'Unauthorized', 401)

    const menuAccess = await requireMenuAccessAppRouter(req, 'ems.finance.invoices')
    if (menuAccess instanceof Response) return menuAccess

    const scope = await getUserTenantScope(userId)
    if (!scope?.companyId) return errorResponse(null, 'Company context not found', 400)

    const body = await req.json()
    const { student_id, enrollment_id, amount, due_date, description, is_gst_invoice, taxable_amount, cgst_amount, sgst_amount, total_gst_amount } = body

    if (!amount || !due_date) {
      return errorResponse(null, 'Amount and due_date are required', 400)
    }

    const { data: lastInvoice, error: lastErr } = await fromSchema(SCHEMAS.EMS, TABLE)
      .select('invoice_number')
      .eq('company_id', scope.companyId)
      .order('id', { ascending: false })
      .limit(1)
      .single()

    if (lastErr && isMissingTableErr(lastErr)) {
      return errorResponse(null, 'Invoices table not yet created — run the SQL migration first', 500)
    }

    const lastNum = lastInvoice?.invoice_number
      ? parseInt(lastInvoice.invoice_number.replace('INV-', '')) || 0
      : 0
    const invoiceNumber = `INV-${String(lastNum + 1).padStart(4, '0')}`

    const { data, error } = await fromSchema(SCHEMAS.EMS, TABLE)
      .insert({
        company_id: scope.companyId,
        student_id: student_id || null,
        enrollment_id: enrollment_id || null,
        invoice_number: invoiceNumber,
        amount,
        due_date,
        status: 'pending',
        description: description || null,
        created_by: userId,
        is_gst_invoice: is_gst_invoice || false,
        taxable_amount: taxable_amount || null,
        cgst_amount: cgst_amount || null,
        sgst_amount: sgst_amount || null,
        total_gst_amount: total_gst_amount || null
      })
      .select()
      .single()

    if (error) {
      if (isMissingTableErr(error)) return errorResponse(null, 'Invoices table not yet created — run the SQL migration first', 500)
      return errorResponse(null, error.message, 500)
    }

    return successResponse(data, 'Invoice created successfully')
  } catch (error: any) {
    console.error('[Invoices POST] Error:', error.message)
    return errorResponse(null, error.message, 500)
  }
}

export async function PUT(req: NextRequest) {
  try {
    const userId = await getUserIdFromToken(req)
    if (!userId) return errorResponse(null, 'Unauthorized', 401)

    const menuAccess = await requireMenuAccessAppRouter(req, 'ems.finance.invoices')
    if (menuAccess instanceof Response) return menuAccess

    const scope = await getUserTenantScope(userId)
    if (!scope?.companyId) return errorResponse(null, 'Company context not found', 400)

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    const mode = searchParams.get('mode')

    if (!id) return errorResponse(null, 'Invoice ID is required', 400)

    if (mode === 'status') {
      const body = await req.json()
      const { status } = body
      if (!['pending', 'paid', 'overdue', 'cancelled'].includes(status)) {
        return errorResponse(null, 'Invalid status value', 400)
      }
      const { data, error } = await fromSchema(SCHEMAS.EMS, TABLE)
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('company_id', scope.companyId)
        .select()
        .single()
      if (error) {
        if (isMissingTableErr(error)) return errorResponse(null, 'Invoices table not yet created', 500)
        return errorResponse(null, error.message, 500)
      }
      return successResponse(data, 'Invoice status updated')
    }

    const body = await req.json()
    const updateData: Record<string, any> = { updated_at: new Date().toISOString() }
    if (body.amount !== undefined) updateData.amount = body.amount
    if (body.due_date !== undefined) updateData.due_date = body.due_date
    if (body.description !== undefined) updateData.description = body.description
    if (body.discount_id !== undefined) updateData.discount_id = body.discount_id
    if (body.discount_amount !== undefined) updateData.discount_amount = body.discount_amount
    if (body.final_amount !== undefined) updateData.final_amount = body.final_amount
    if (body.is_gst_invoice !== undefined) updateData.is_gst_invoice = body.is_gst_invoice
    if (body.taxable_amount !== undefined) updateData.taxable_amount = body.taxable_amount
    if (body.cgst_amount !== undefined) updateData.cgst_amount = body.cgst_amount
    if (body.sgst_amount !== undefined) updateData.sgst_amount = body.sgst_amount
    if (body.total_gst_amount !== undefined) updateData.total_gst_amount = body.total_gst_amount

    const { data, error } = await fromSchema(SCHEMAS.EMS, TABLE)
      .update(updateData)
      .eq('id', id)
      .eq('company_id', scope.companyId)
      .select()
      .single()

    if (error) {
      if (isMissingTableErr(error)) return errorResponse(null, 'Invoices table not yet created', 500)
      return errorResponse(null, error.message, 500)
    }

    await dataCache.invalidate(`ems_dashboard_stats:${scope.companyId}`)

    return successResponse(data, 'Invoice updated successfully')
  } catch (error: any) {
    console.error('[Invoices PUT] Error:', error.message)
    return errorResponse(null, error.message, 500)
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const userId = await getUserIdFromToken(req)
    if (!userId) return errorResponse(null, 'Unauthorized', 401)

    const menuAccess = await requireMenuAccessAppRouter(req, 'ems.finance.invoices')
    if (menuAccess instanceof Response) return menuAccess

    const scope = await getUserTenantScope(userId)
    if (!scope?.companyId) return errorResponse(null, 'Company context not found', 400)

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return errorResponse(null, 'Invoice ID is required', 400)

    const { error } = await fromSchema(SCHEMAS.EMS, TABLE)
      .update({ deleted_at: new Date().toISOString(), deleted_by: userId })
      .eq('id', id)
      .eq('company_id', scope.companyId)

    if (error) {
      if (isMissingTableErr(error)) return errorResponse(null, 'Invoices table not yet created', 500)
      return errorResponse(null, error.message, 500)
    }
    return successResponse(null, 'Invoice deleted successfully')
  } catch (error: any) {
    console.error('[Invoices DELETE] Error:', error.message)
    return errorResponse(null, error.message, 500)
  }
}
