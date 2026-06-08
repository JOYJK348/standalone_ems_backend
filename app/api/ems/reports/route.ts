import { NextRequest } from 'next/server'
import { successResponse, errorResponse } from '@/lib/errorHandler'
import { getUserIdFromToken } from '@/lib/jwt'
import { getUserTenantScope } from '@/middleware/tenantFilter'
import { requireMenuAccessAppRouter } from '@/lib/menuAccessAppRouter'
import { ems, fromSchema } from '@/lib/supabase'
import { SCHEMAS } from '@/config/constants'
import { dataCache } from '@/lib/cache/dataCache'

const CACHE_TTL = 30 * 1000

export async function GET(req: NextRequest) {
  try {
    const userId = await getUserIdFromToken(req)
    if (!userId) return errorResponse(null, 'Unauthorized', 401)

    const menuAccess = await requireMenuAccessAppRouter(req, 'ems.reports')
    if (menuAccess instanceof Response) return menuAccess

    const scope = await getUserTenantScope(userId)
    if (!scope?.companyId) return errorResponse(null, 'Company context not found', 400)

    const { searchParams } = new URL(req.url)
    const type = searchParams.get('type') || 'summary'

    const cacheKey = `ems_reports:${scope.companyId}:${type}`
    const cached = await dataCache.get(cacheKey)
    if (cached) return successResponse(cached, `${type} report generated (cached)`)

    const companyId = scope.companyId

    switch (type) {
      case 'summary': {
        const [totalRevenue, totalPayments, pendingCount, paidCount, overdueCount] = await Promise.all([
          fromSchema(SCHEMAS.EMS, 'invoices')
            .select('amount')
            .eq('company_id', companyId)
            .eq('status', 'paid')
            .is('deleted_at', null)
            .then(r => (r.data || []).reduce((s: number, x: any) => s + Number(x.amount || 0), 0))
            .catch(() => 0),
          ems.feePayments()
            .select('amount_paid')
            .eq('company_id', companyId)
            .eq('payment_status', 'COMPLETED')
            .then(r => (r.data || []).reduce((s: number, x: any) => s + Number(x.amount_paid || 0), 0))
            .catch(() => 0),
          fromSchema(SCHEMAS.EMS, 'invoices')
            .select('id', { count: 'exact', head: true })
            .eq('company_id', companyId)
            .eq('status', 'pending')
            .is('deleted_at', null)
            .then(r => r.count ?? 0)
            .catch(() => 0),
          fromSchema(SCHEMAS.EMS, 'invoices')
            .select('id', { count: 'exact', head: true })
            .eq('company_id', companyId)
            .eq('status', 'paid')
            .is('deleted_at', null)
            .then(r => r.count ?? 0)
            .catch(() => 0),
          fromSchema(SCHEMAS.EMS, 'invoices')
            .select('id', { count: 'exact', head: true })
            .eq('company_id', companyId)
            .eq('status', 'overdue')
            .is('deleted_at', null)
            .then(r => r.count ?? 0)
            .catch(() => 0),
        ])

        const summaryData = {
          totalRevenue,
          totalPayments,
          pendingCount,
          paidCount,
          overdueCount,
          outstandingBalance: totalRevenue - totalPayments
        }
        await dataCache.set(cacheKey, summaryData, CACHE_TTL)
        return successResponse(summaryData, 'Summary report generated')
      }

      case 'monthly': {
        const sixMonthsAgo = new Date()
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

        const [invoicesData, paymentsData] = await Promise.all([
          fromSchema(SCHEMAS.EMS, 'invoices')
            .select('amount, created_at, status')
            .eq('company_id', companyId)
            .is('deleted_at', null)
            .gte('created_at', sixMonthsAgo.toISOString())
            .then(r => r.data || [])
            .catch(() => []),
          ems.feePayments()
            .select('amount_paid, payment_date, payment_status')
            .eq('company_id', companyId)
            .gte('payment_date', sixMonthsAgo.toISOString().split('T')[0])
            .then(r => r.data || [])
            .catch(() => [])
        ])

        const months: Record<string, { revenue: number; collections: number; label: string }> = {}
        for (let i = 0; i < 6; i++) {
          const d = new Date()
          d.setMonth(d.getMonth() - i)
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
          months[key] = { revenue: 0, collections: 0, label: d.toLocaleString('default', { month: 'short', year: 'numeric' }) }
        }

        for (const inv of invoicesData) {
          const d = new Date(inv.created_at)
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
          if (months[key]) months[key].revenue += Number(inv.amount || 0)
        }

        for (const pmt of paymentsData) {
          const d = new Date(pmt.payment_date)
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
          if (months[key] && pmt.payment_status === 'COMPLETED') months[key].collections += Number(pmt.amount_paid || 0)
        }

        const monthlyData = {
          monthly: Object.entries(months)
            .reverse()
            .map(([key, val]) => ({ month: key, ...val }))
        }
        await dataCache.set(cacheKey, monthlyData, CACHE_TTL)
        return successResponse(monthlyData, 'Monthly report generated')
      }

      case 'invoice_status': {
        const [pending, paid, overdue, cancelled] = await Promise.all([
          fromSchema(SCHEMAS.EMS, 'invoices')
            .select('id', { count: 'exact', head: true })
            .eq('company_id', companyId)
            .eq('status', 'pending')
            .is('deleted_at', null)
            .then(r => r.count ?? 0).catch(() => 0),
          fromSchema(SCHEMAS.EMS, 'invoices')
            .select('id', { count: 'exact', head: true })
            .eq('company_id', companyId)
            .eq('status', 'paid')
            .is('deleted_at', null)
            .then(r => r.count ?? 0).catch(() => 0),
          fromSchema(SCHEMAS.EMS, 'invoices')
            .select('id', { count: 'exact', head: true })
            .eq('company_id', companyId)
            .eq('status', 'overdue')
            .is('deleted_at', null)
            .then(r => r.count ?? 0).catch(() => 0),
          fromSchema(SCHEMAS.EMS, 'invoices')
            .select('id', { count: 'exact', head: true })
            .eq('company_id', companyId)
            .eq('status', 'cancelled')
            .is('deleted_at', null)
            .then(r => r.count ?? 0).catch(() => 0),
        ])

        const statusData = {
          statuses: { pending, paid, overdue, cancelled },
          total: pending + paid + overdue + cancelled
        }
        await dataCache.set(cacheKey, statusData, CACHE_TTL)
        return successResponse(statusData, 'Invoice status report generated')
      }

      default:
        return errorResponse(null, 'Invalid report type. Use: summary, monthly, invoice_status', 400)
    }
  } catch (error: any) {
    console.error('[Reports GET] Error:', error.message)
    return errorResponse(null, error.message, 500)
  }
}
