import { NextRequest } from 'next/server'
import { successResponse, errorResponse } from '@/lib/errorHandler'
import { getUserIdFromToken } from '@/lib/jwt'
import { getUserTenantScope } from '@/middleware/tenantFilter'
import { requireMenuAccessAppRouter } from '@/lib/menuAccessAppRouter'
import { fromSchema } from '@/lib/supabase'
import { SCHEMAS } from '@/config/constants'

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
    const feeStructureId = searchParams.get('fee_structure_id')

    let query = fromSchema(SCHEMAS.EMS, 'fee_installments')
      .select('*, fee_structure!inner(company_id, fee_name, fee_type, amount)')
      .eq('fee_structure.company_id', scope.companyId)
      .order('installment_no', { ascending: true })

    if (feeStructureId) {
      query = query.eq('fee_structure_id', feeStructureId)
    }

    const { data, error } = await query

    if (error) {
      if (isMissingTableErr(error)) return successResponse([], 'Fee installments table not yet created — run migration')
      return errorResponse(null, error.message, 500)
    }
    return successResponse(data || [], 'Installments fetched successfully')
  } catch (error: any) {
    console.error('[FeeInstallments GET] Error:', error.message)
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
    const { fee_structure_id, installments } = body

    if (!fee_structure_id || !installments || !installments.length) {
      return errorResponse(null, 'fee_structure_id and installments are required', 400)
    }

    const rows = installments.map((i: any) => ({
      fee_structure_id,
      company_id: scope.companyId,
      installment_no: i.installment_no,
      amount: i.amount,
      due_date: i.due_date,
      late_fee: i.late_fee || 0
    }))

    const { data, error } = await fromSchema(SCHEMAS.EMS, 'fee_installments')
      .insert(rows)
      .select()

    if (error) {
      if (isMissingTableErr(error)) return errorResponse(null, 'Fee installments table not yet created — run migration', 500)
      return errorResponse(null, error.message, 500)
    }
    return successResponse(data, 'Installments created successfully')
  } catch (error: any) {
    console.error('[FeeInstallments POST] Error:', error.message)
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
    if (!id) return errorResponse(null, 'Installment ID is required', 400)

    const body = await req.json()
    const updateData: Record<string, any> = { updated_at: new Date().toISOString() }
    if (body.amount !== undefined) updateData.amount = body.amount
    if (body.due_date !== undefined) updateData.due_date = body.due_date
    if (body.is_paid !== undefined) updateData.is_paid = body.is_paid
    if (body.paid_date !== undefined) updateData.paid_date = body.paid_date
    if (body.late_fee !== undefined) updateData.late_fee = body.late_fee

    const { data, error } = await fromSchema(SCHEMAS.EMS, 'fee_installments')
      .update(updateData)
      .eq('id', id)
      .eq('company_id', scope.companyId)
      .select()
      .single()

    if (error) {
      if (isMissingTableErr(error)) return errorResponse(null, 'Fee installments table not yet created', 500)
      return errorResponse(null, error.message, 500)
    }
    return successResponse(data, 'Installment updated successfully')
  } catch (error: any) {
    console.error('[FeeInstallments PUT] Error:', error.message)
    return errorResponse(null, error.message, 500)
  }
}
