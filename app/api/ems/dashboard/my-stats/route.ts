import { NextRequest } from 'next/server'
import { successResponse, errorResponse } from '@/lib/errorHandler'
import { getUserIdFromToken } from '@/lib/jwt'
import { getUserTenantScope } from '@/middleware/tenantFilter'
import { requireMenuAccessAppRouter } from '@/lib/menuAccessAppRouter'
import { ems, core, fromSchema } from '@/lib/supabase'
import { SCHEMAS } from '@/config/constants'

export async function GET(req: NextRequest) {
  try {
    const userId = await getUserIdFromToken(req)
    if (!userId) return errorResponse(null, 'Unauthorized', 401)

    const menuAccess = await requireMenuAccessAppRouter(req, 'ems.dashboard')
    if (menuAccess instanceof Response) return menuAccess

    const scope = await getUserTenantScope(userId)
    if (!scope) return errorResponse(null, 'No tenant scope', 403)

    const companyId = scope.companyId
    const roleName = scope.roleName || ''
    const emsProfile = scope.emsProfile

    const baseFilters: Record<string, any> = {}
    if (companyId) baseFilters.company_id = companyId

    const deletedFilter = { deleted_at: null }

    const queryList: (() => Promise<[string, number | null]>)[] = []

    queryList.push(async () => {
      const r = await ems.courses().select('id', { count: 'exact', head: true }).match({ ...baseFilters, ...deletedFilter })
      return ['totalCourses', r.count]
    })

    queryList.push(async () => {
      const r = await ems.batches().select('id', { count: 'exact', head: true }).match({ ...baseFilters, ...deletedFilter })
      return ['totalBatches', r.count]
    })

    queryList.push(async () => {
      const r = await ems.students().select('id', { count: 'exact', head: true }).match({ ...baseFilters, ...deletedFilter })
      return ['totalStudents', r.count]
    })

    queryList.push(async () => {
      const r = await core.employees().select('id', { count: 'exact', head: true }).match({ ...baseFilters, ...deletedFilter })
      return ['totalTutors', r.count]
    })

    queryList.push(async () => {
      const r = await ems.enrollments().select('id', { count: 'exact', head: true }).match({ ...baseFilters, ...deletedFilter })
      return ['totalEnrollments', r.count]
    })

    if (roleName === 'TUTOR' && emsProfile?.profileId) {
      queryList.push(async () => {
        const r = await ems.courses().select('id', { count: 'exact', head: true }).match({ ...baseFilters, ...deletedFilter })
        return ['myCourses', r.count]
      })
      queryList.push(async () => {
        const r = await ems.assignments().select('id', { count: 'exact', head: true }).match({ ...baseFilters, ...deletedFilter })
        return ['pendingGrading', r.count]
      })
    }

    if (roleName === 'STUDENT' && emsProfile?.profileId) {
      queryList.push(async () => {
        const r = await ems.enrollments().select('id', { count: 'exact', head: true }).match({ ...baseFilters, student_id: emsProfile.profileId, ...deletedFilter })
        return ['enrolledCourses', r.count]
      })
      queryList.push(async () => {
        const r = await ems.assignments().select('id', { count: 'exact', head: true }).match({ ...baseFilters, ...deletedFilter })
        return ['pendingAssignments', r.count]
      })
    }

    if (roleName === 'ACADEMIC_MANAGER') {
      queryList.push(async () => {
        const r = await ems.assignments().select('id', { count: 'exact', head: true }).match({ ...baseFilters, ...deletedFilter })
        return ['pendingGrading', r.count]
      })
      queryList.push(async () => {
        const r = await ems.liveClasses().select('id', { count: 'exact', head: true }).match({ ...baseFilters, ...deletedFilter })
        return ['todaysClasses', r.count]
      })
    }

    if (roleName === 'HR_MANAGER' || roleName === 'HRMS_ADMIN') {
      queryList.push(async () => {
        const r = await core.employees()
          .select('id', { count: 'exact', head: true })
          .match({ ...baseFilters, is_active: true })
        return ['totalTutors', r.count ?? 0]
      })
      queryList.push(async () => {
        const r = await ems.enrollments()
          .select('id', { count: 'exact', head: true })
          .match({ ...baseFilters })
          .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        return ['newEnrollmentsWeek', r.count ?? 0]
      })
      queryList.push(async () => {
        try {
          const sinceDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
          const { data: recentSessions } = await ems.attendanceSessions()
            .select('id')
            .match({ ...baseFilters })
            .gte('session_date', sinceDate)
          const sessionIds = (recentSessions || []).map((s: any) => s.id)
          if (sessionIds.length === 0) return ['attendanceRate', 0]
          const { data: records } = await ems.attendanceRecords()
            .select('status')
            .in('session_id', sessionIds)
          const total = records?.length || 0
          const present = (records || []).filter((r: any) => r.status === 'PRESENT' || r.status === 'LATE').length
          const rate = total > 0 ? Math.round((present / total) * 100) : 0
          return ['attendanceRate', rate]
        } catch {
          return ['attendanceRate', 0]
        }
      })
      queryList.push(async () => {
        const r = await ems.enrollments()
          .select('id', { count: 'exact', head: true })
          .match({ ...baseFilters, enrollment_status: 'active' })
        return ['activeEnrollments', r.count ?? 0]
      })
      queryList.push(async () => {
        const r = await ems.courseTutors()
          .select('id', { count: 'exact', head: true })
          .match({ ...baseFilters, ...deletedFilter })
        return ['pendingAssignments', r.count ?? 0]
      })
    }

    if (roleName === 'FINANCE_MANAGER') {
      queryList.push(async () => {
        try {
          const r = await fromSchema(SCHEMAS.EMS, 'invoices')
            .select('amount')
            .match({ ...baseFilters, status: 'pending', ...deletedFilter })
          const amounts = (r.data || []).map((x: any) => Number(x.amount) || 0)
          const total = amounts.reduce((a: number, b: number) => a + b, 0)
          return ['outstandingBalance', total]
        } catch {
          return ['outstandingBalance', 0]
        }
      })
      queryList.push(async () => {
        try {
          const now = new Date()
          const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
          const r = await fromSchema(SCHEMAS.EMS, 'invoices')
            .select('id', { count: 'exact', head: true })
            .match({ ...baseFilters, ...deletedFilter })
            .gte('created_at', startOfMonth)
          return ['invoicesThisMonth', r.count ?? 0]
        } catch {
          return ['invoicesThisMonth', 0]
        }
      })
      queryList.push(async () => {
        try {
          const now = new Date()
          const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
          const r = await ems.feePayments()
            .select('amount_paid')
            .match({ ...baseFilters, payment_status: 'COMPLETED' })
            .gte('payment_date', startOfMonth)
          const amounts = (r.data || []).map((x: any) => Number(x.amount_paid) || 0)
          const total = amounts.reduce((a: number, b: number) => a + b, 0)
          return ['totalCollections', total]
        } catch {
          return ['totalCollections', 0]
        }
      })
      queryList.push(async () => {
        try {
          const now = new Date().toISOString()
          const r = await fromSchema(SCHEMAS.EMS, 'invoices')
            .select('id', { count: 'exact', head: true })
            .match({ ...baseFilters, ...deletedFilter })
            .neq('status', 'paid')
            .lt('due_date', now)
          return ['overdueInvoices', r.count ?? 0]
        } catch {
          return ['overdueInvoices', 0]
        }
      })
    }

    const results = await Promise.all(queryList.map(fn => fn()))
    const stats: Record<string, number> = {}
    for (const [key, val] of results) {
      stats[key] = val ?? 0
    }

    return successResponse({ stats, roleName, companyId }, 'Dashboard stats fetched successfully')
  } catch (error: any) {
    console.error('[MyStats] Error:', error.message)
    return errorResponse(null, error.message || 'Failed to fetch dashboard stats', 500)
  }
}
