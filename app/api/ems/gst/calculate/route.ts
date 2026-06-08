import { NextRequest } from 'next/server'
import { successResponse, errorResponse } from '@/lib/errorHandler'
import { getUserIdFromToken } from '@/lib/jwt'
import { getUserTenantScope } from '@/middleware/tenantFilter'
import { requireMenuAccessAppRouter } from '@/lib/menuAccessAppRouter'
import { fromSchema } from '@/lib/supabase'
import { SCHEMAS } from '@/config/constants'

export async function POST(req: NextRequest) {
  try {
    const userId = await getUserIdFromToken(req)
    if (!userId) return errorResponse(null, 'Unauthorized', 401)

    const menuAccess = await requireMenuAccessAppRouter(req, 'ems.finance.invoices')
    if (menuAccess instanceof Response) return menuAccess

    const scope = await getUserTenantScope(userId)
    if (!scope?.companyId) return errorResponse(null, 'Company context not found', 400)

    const body = await req.json()
    const { amount } = body

    if (!amount || amount <= 0) {
      return errorResponse(null, 'Valid amount is required', 400)
    }

    const { data: company, error } = await fromSchema(SCHEMAS.CORE, 'companies')
      .select('gstin, hsn_code, gst_rate')
      .eq('id', scope.companyId)
      .single()

    if (error || !company?.gstin) {
      return errorResponse(null, 'GST not configured for this company', 400)
    }

    const gstRate = Number(company.gst_rate) || 18
    const halfGst = gstRate / 2

    const totalAmount = Number(amount)
    const taxableAmount = Math.round((totalAmount / (1 + gstRate / 100)) * 100) / 100
    const gstAmount = Math.round((totalAmount - taxableAmount) * 100) / 100
    const cgst = Math.round((gstAmount / 2) * 100) / 100
    const sgst = Math.round((gstAmount / 2) * 100) / 100

    return successResponse({
      taxable_amount: taxableAmount,
      cgst_amount: cgst,
      sgst_amount: sgst,
      total_gst: gstAmount,
      total_amount: totalAmount,
      gstin: company.gstin,
      hsn_code: company.hsn_code,
      gst_rate: gstRate,
      cgst_rate: halfGst,
      sgst_rate: halfGst
    }, 'GST calculated successfully')
  } catch (error: any) {
    console.error('[GST Calculate] Error:', error.message)
    return errorResponse(null, error.message, 500)
  }
}
