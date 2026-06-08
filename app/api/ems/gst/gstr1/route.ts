import { NextRequest, NextResponse } from 'next/server'
import { errorResponse } from '@/lib/errorHandler'
import { getUserIdFromToken } from '@/lib/jwt'
import { getUserTenantScope } from '@/middleware/tenantFilter'
import { requireMenuAccessAppRouter } from '@/lib/menuAccessAppRouter'
import { fromSchema } from '@/lib/supabase'
import { SCHEMAS } from '@/config/constants'

export async function GET(req: NextRequest) {
  try {
    const userId = await getUserIdFromToken(req)
    if (!userId) return errorResponse(null, 'Unauthorized', 401)

    const menuAccess = await requireMenuAccessAppRouter(req, 'ems.finance.invoices')
    if (menuAccess instanceof Response) return menuAccess

    const scope = await getUserTenantScope(userId)
    if (!scope?.companyId) return errorResponse(null, 'Company context not found', 400)

    const { searchParams } = new URL(req.url)
    const month = searchParams.get('month')
    const format = searchParams.get('format') || 'csv'

    const { data: company } = await fromSchema(SCHEMAS.CORE, 'companies')
      .select('gstin, legal_name, hsn_code')
      .eq('id', scope.companyId)
      .single()

    let query = fromSchema(SCHEMAS.EMS, 'invoices')
      .select('invoice_number, student_id, amount, taxable_amount, cgst_amount, sgst_amount, total_gst_amount, is_gst_invoice, status, created_at')
      .eq('company_id', scope.companyId)
      .eq('is_gst_invoice', true)
      .is('deleted_at', null)

    if (month) {
      const [year, m] = month.split('-')
      query = query.gte('created_at', `${year}-${m}-01`)
      const nextM = parseInt(m) + 1
      query = query.lt('created_at', nextM > 12 ? `${parseInt(year) + 1}-01-01` : `${year}-${String(nextM).padStart(2, '0')}-01`)
    }

    const { data: invoices, error } = await query.order('created_at', { ascending: false })

    if (error || !invoices) {
      return errorResponse(null, error?.message || 'No invoices found', 500)
    }

    const csvHeader = 'GSTIN,LegalName,HSNCode,InvoiceNo,InvoiceDate,InvoiceValue,TaxableValue,CGSTAmount,SGSTAmount,TotalGST\n'
    const csvRows = invoices.map(inv => {
      const date = inv.created_at ? new Date(inv.created_at).toISOString().split('T')[0] : ''
      return `${company?.gstin || ''},"${company?.legal_name || ''}",${company?.hsn_code || '9992'},${inv.invoice_number},${date},${inv.amount || 0},${inv.taxable_amount || 0},${inv.cgst_amount || 0},${inv.sgst_amount || 0},${inv.total_gst_amount || 0}`
    }).join('\n')

    const csv = csvHeader + csvRows

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="GSTR1_${month || 'all'}.csv"`
      }
    })
  } catch (error: any) {
    console.error('[GSTR1 GET] Error:', error.message)
    return errorResponse(null, error.message, 500)
  }
}
