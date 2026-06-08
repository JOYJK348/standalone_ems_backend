import { NextRequest } from 'next/server'
import { successResponse, errorResponse } from '@/lib/errorHandler'
import { getUserIdFromToken } from '@/lib/jwt'
import { getUserTenantScope } from '@/middleware/tenantFilter'
import { requireMenuAccessAppRouter } from '@/lib/menuAccessAppRouter'
import { ems } from '@/lib/supabase'
import crypto from 'crypto'

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
    const studentId = searchParams.get('student_id')
    const status = searchParams.get('status')

    let query = ems.paymentLinks()
      .select('*, students!inner(id, first_name, last_name)')
      .eq('students.company_id', scope.companyId)
      .order('created_at', { ascending: false })
      .limit(50)

    if (studentId) query = query.eq('student_id', parseInt(studentId))
    if (status) query = query.eq('status', status)

    const { data, error } = await query

    if (error) {
      if (isMissingTableErr(error)) return successResponse([], 'Payment links table not yet created')
      return errorResponse(null, error.message, 500)
    }
    return successResponse(data || [], 'Payment links fetched')
  } catch (error: any) {
    console.error('[PaymentLinks GET] Error:', error.message)
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
    const { student_id, invoice_id, amount, provider } = body

    if (!student_id || !amount) {
      return errorResponse(null, 'student_id and amount are required', 400)
    }

    const linkId = crypto.randomUUID().slice(0, 8).toUpperCase()
    const paymentLink = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/pay/${linkId}`

    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7)

    const { data, error } = await ems.paymentLinks().insert({
      company_id: scope.companyId,
      student_id,
      invoice_id: invoice_id || null,
      amount,
      link_url: paymentLink,
      short_url: paymentLink,
      provider: provider || 'RAZORPAY',
      status: 'ACTIVE',
      expires_at: expiresAt.toISOString(),
      created_by: userId
    }).select().single()

    if (error) {
      if (isMissingTableErr(error)) return errorResponse(null, 'Payment links table not yet created', 500)
      return errorResponse(null, error.message, 500)
    }
    return successResponse(data, 'Payment link created')
  } catch (error: any) {
    console.error('[PaymentLinks POST] Error:', error.message)
    return errorResponse(null, error.message, 500)
  }
}
