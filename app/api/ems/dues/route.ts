import { NextRequest } from 'next/server'
import { successResponse, errorResponse } from '@/lib/errorHandler'
import { getUserIdFromToken } from '@/lib/jwt'
import { getUserTenantScope } from '@/middleware/tenantFilter'
import { requireMenuAccessAppRouter } from '@/lib/menuAccessAppRouter'
import { ems } from '@/lib/supabase'
import { dataCache } from '@/lib/cache/dataCache'

function isMissingTableErr(err: { message?: string; code?: string } | null): boolean {
  if (!err) return false
  return !!(err.message?.includes('relation') || err.code === '42P01' || err.message?.includes('permission denied') || err.message?.includes('Could not find the table'))
}

export async function GET(req: NextRequest) {
  try {
    const userId = await getUserIdFromToken(req)
    if (!userId) return errorResponse(null, 'Unauthorized', 401)

    const menuAccess = await requireMenuAccessAppRouter(req, 'ems.finance.due_tracking')
    if (menuAccess instanceof Response) return menuAccess

    const scope = await getUserTenantScope(userId)
    if (!scope?.companyId) return errorResponse(null, 'Company context not found', 400)

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    const status = searchParams.get('status')
    const studentId = searchParams.get('student_id')
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50')))
    const offset = (page - 1) * limit

    try {
      if (id) {
        const { data, error } = await ems.dueReminders()
          .select('*, students!inner(id, first_name, last_name, phone)')
          .eq('id', id)
          .single()
        if (error) {
          if (isMissingTableErr(error)) return successResponse(null, 'Due reminders table not yet created')
          return errorResponse(null, error.message, 500)
        }
        return successResponse(data, 'Due reminder fetched')
      }

      let query = ems.dueReminders()
        .select('*, students!inner(id, first_name, last_name, phone)', { count: 'exact' })
        .eq('students.company_id', scope.companyId)

      if (status === 'overdue') query = query.lt('due_date', new Date().toISOString().split('T')[0]).eq('payment_received', false)
      if (status === 'pending') query = query.gte('due_date', new Date().toISOString().split('T')[0]).eq('payment_received', false)
      if (status === 'paid') query = query.eq('payment_received', true)
      if (status === 'reminded') query = query.eq('reminder_sent', true)
      if (studentId) query = query.eq('student_id', parseInt(studentId))

      const { data, error, count } = await query
        .order('due_date', { ascending: true })
        .range(offset, offset + limit - 1)

      if (error) {
        if (isMissingTableErr(error)) return successResponse({ data: [], pagination: { page, limit, total: 0, totalPages: 0 } }, 'Due reminders table not yet created')
        return errorResponse(null, error.message, 500)
      }

      return successResponse({
        data: data || [],
        pagination: {
          page,
          limit,
          total: count || 0,
          totalPages: Math.ceil((count || 0) / limit)
        }
      }, 'Dues fetched successfully')
    } catch (tableErr: any) {
      if (isMissingTableErr(tableErr)) return successResponse({ data: [], pagination: { page, limit, total: 0, totalPages: 0 } }, 'Due reminders table not yet created')
      throw tableErr
    }
  } catch (error: any) {
    console.error('[Dues GET] Error:', error.message)
    return errorResponse(null, error.message, 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await getUserIdFromToken(req)
    if (!userId) return errorResponse(null, 'Unauthorized', 401)

    const menuAccess = await requireMenuAccessAppRouter(req, 'ems.finance.due_tracking')
    if (menuAccess instanceof Response) return menuAccess

    const scope = await getUserTenantScope(userId)
    if (!scope?.companyId) return errorResponse(null, 'Company context not found', 400)

    const body = await req.json()
    const { student_id, fee_structure_id, installment_id, invoice_id, amount_due, due_date } = body

    if (!student_id || !amount_due || !due_date) {
      return errorResponse(null, 'student_id, amount_due, and due_date are required', 400)
    }

    const { data, error } = await ems.dueReminders().insert({
      company_id: scope.companyId,
      student_id,
      fee_structure_id: fee_structure_id || null,
      installment_id: installment_id || null,
      invoice_id: invoice_id || null,
      amount_due,
      due_date,
      created_at: new Date().toISOString()
    }).select().single()

    if (error) {
      if (isMissingTableErr(error)) return errorResponse(null, 'Due reminders table not yet created', 500)
      return errorResponse(null, error.message, 500)
    }

    await dataCache.invalidate(`ems_dashboard_stats:${scope.companyId}`)

    return successResponse(data, 'Due reminder created')
  } catch (error: any) {
    console.error('[Dues POST] Error:', error.message)
    return errorResponse(null, error.message, 500)
  }
}

export async function PUT(req: NextRequest) {
  try {
    const userId = await getUserIdFromToken(req)
    if (!userId) return errorResponse(null, 'Unauthorized', 401)

    const menuAccess = await requireMenuAccessAppRouter(req, 'ems.finance.due_tracking')
    if (menuAccess instanceof Response) return menuAccess

    const scope = await getUserTenantScope(userId)
    if (!scope?.companyId) return errorResponse(null, 'Company context not found', 400)

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return errorResponse(null, 'Due reminder ID is required', 400)

    const body = await req.json()
    const updateData: Record<string, any> = { updated_at: new Date().toISOString() }
    if (body.reminder_sent !== undefined) updateData.reminder_sent = body.reminder_sent
    if (body.sent_via !== undefined) updateData.sent_via = body.sent_via
    if (body.reminder_date !== undefined) updateData.reminder_date = body.reminder_date
    if (body.payment_received !== undefined) updateData.payment_received = body.payment_received
    if (body.late_fee_applied !== undefined) updateData.late_fee_applied = body.late_fee_applied

    const { data, error } = await ems.dueReminders()
      .update(updateData)
      .eq('id', id)
      .eq('company_id', scope.companyId)
      .select()
      .single()

    if (error) {
      if (isMissingTableErr(error)) return errorResponse(null, 'Due reminders table not yet created', 500)
      return errorResponse(null, error.message, 500)
    }

    await dataCache.invalidate(`ems_dashboard_stats:${scope.companyId}`)

    return successResponse(data, 'Due reminder updated')
  } catch (error: any) {
    console.error('[Dues PUT] Error:', error.message)
    return errorResponse(null, error.message, 500)
  }
}
