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

export async function POST(req: NextRequest) {
  try {
    const userId = await getUserIdFromToken(req)
    if (!userId) return errorResponse(null, 'Unauthorized', 401)

    const menuAccess = await requireMenuAccessAppRouter(req, 'ems.finance.fees')
    if (menuAccess instanceof Response) return menuAccess

    const scope = await getUserTenantScope(userId)
    if (!scope?.companyId) return errorResponse(null, 'Company context not found', 400)

    const { installment_id } = await req.json()
    if (!installment_id) return errorResponse(null, 'installment_id is required', 400)

    // Get installment with fee structure
    const { data: installment, error: instErr } = await fromSchema(SCHEMAS.EMS, 'fee_installments')
      .select('*, fee_structure!inner(fee_type, amount, company_id)')
      .eq('id', installment_id)
      .eq('fee_structure.company_id', scope.companyId)
      .single()

    if (instErr || !installment) {
      if (isMissingTableErr(instErr)) return errorResponse(null, 'Fee installments table not yet created — run migration', 500)
      return errorResponse(null, 'Installment not found', 404)
    }

    const feeType = (installment.fee_structure as any)?.fee_type || 'TUITION'

    // Get late fee config for this company + fee type
    const { data: config, error: cfgErr } = await fromSchema(SCHEMAS.EMS, 'late_fee_config')
      .select('*')
      .eq('company_id', scope.companyId)
      .eq('fee_type', feeType)
      .eq('is_active', true)
      .single()

    if (cfgErr || !config) {
      return successResponse({ late_fee: 0, days_late: 0, message: 'No late fee config found for this fee type' })
    }

    // Calculate days late (past due date + grace period)
    const dueDate = new Date(installment.due_date)
    const today = new Date()
    const diffMs = today.getTime() - dueDate.getTime()
    const daysLateRaw = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)))
    const daysLate = Math.max(0, daysLateRaw - (config.grace_period_days || 0))

    if (daysLate <= 0) {
      return successResponse({ late_fee: 0, days_late: 0, within_grace: true })
    }

    // Calculate late fee
    let lateFee = 0
    if (config.late_fee_type === 'FIXED') {
      lateFee = (config.late_fee_amount || 0) * Math.ceil(daysLate / 30)
    } else {
      lateFee = (installment.amount * (config.late_fee_percentage || 0) / 100) * Math.ceil(daysLate / 30)
    }

    // Cap at max
    if (config.max_late_fee) {
      lateFee = Math.min(lateFee, config.max_late_fee)
    }

    return successResponse({
      late_fee: Math.round(lateFee * 100) / 100,
      days_late: daysLate,
      fee_type: feeType,
      installment_amount: installment.amount,
      grace_period_days: config.grace_period_days
    })
  } catch (error: any) {
    console.error('[LateFee Calculate] Error:', error.message)
    return errorResponse(null, error.message, 500)
  }
}
