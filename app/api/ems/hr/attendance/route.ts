import { NextRequest } from 'next/server'
import { successResponse, errorResponse } from '@/lib/errorHandler'
import { getUserIdFromToken } from '@/lib/jwt'
import { getUserTenantScope } from '@/middleware/tenantFilter'
import { requireMenuAccessAppRouter } from '@/lib/menuAccessAppRouter'
import { ems, core } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  try {
    const userId = await getUserIdFromToken(req)
    if (!userId) return errorResponse(null, 'Unauthorized', 401)

    const menuAccess = await requireMenuAccessAppRouter(req, 'ems.hr.attendance')
    if (menuAccess instanceof Response) return menuAccess

    const scope = await getUserTenantScope(userId)
    if (!scope?.companyId) return errorResponse(null, 'Company context not found', 400)

    const { searchParams } = new URL(req.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '10')
    const offset = (page - 1) * limit
    const days = parseInt(searchParams.get('days') || '30')
    const view = searchParams.get('view') || 'sessions' // sessions | people
    const userType = searchParams.get('user_type') || '' // STUDENT | TUTOR | STAFF
    const courseId = searchParams.get('course_id') || ''
    const companyId = scope.companyId

    const sinceDate = new Date()
    sinceDate.setDate(sinceDate.getDate() - days)

    if (view === 'people') {
      // ── Person-wise attendance ──
      // First get sessions within date range for this company
      const { data: sessionsInRange } = await ems.attendanceSessions()
        .select('id')
        .eq('company_id', companyId)
        .gte('session_date', sinceDate.toISOString().split('T')[0])

      const sessionIdList = (sessionsInRange || []).map((s: any) => s.id)
      if (sessionIdList.length === 0) {
        return successResponse({ people: [], summary: { totalPeople: 0, totalRecords: 0, totalPresent: 0, overallRate: 0, days } }, 'No attendance data')
      }

      let recordQuery = ems.attendanceRecords()
        .select('*')
        .in('session_id', sessionIdList)

      if (userType) recordQuery = recordQuery.eq('user_type', userType)

      const { data: records, error: recError } = await recordQuery
        .order('created_at', { ascending: false })

      if (recError) return errorResponse(null, recError.message, 500)

      // Group by person (student_id or user_id)
      const personMap: Record<string, any> = {}
      for (const r of records || []) {
        const key = r.student_id ? `student_${r.student_id}` : `user_${r.user_id}`
        if (!personMap[key]) {
          personMap[key] = {
            id: key,
            student_id: r.student_id,
            user_id: r.user_id,
            user_type: r.user_type,
            total: 0,
            present: 0,
            late: 0,
            absent: 0,
          }
        }
        personMap[key].total++
        if (r.status === 'PRESENT') personMap[key].present++
        else if (r.status === 'LATE') personMap[key].late++
        else if (r.status === 'ABSENT') personMap[key].absent++
      }

      // Fetch student/user names
      const studentIds = [...new Set((records || []).filter(r => r.student_id).map(r => r.student_id))]
      const userIds = [...new Set((records || []).filter(r => r.user_id && !r.student_id).map(r => r.user_id))]

      let students: any[] = []
      let users: any[] = []
      if (studentIds.length > 0) {
        const { data: s } = await ems.students().select('id, first_name, last_name, email, student_code').in('id', studentIds)
        students = s || []
      }
      if (userIds.length > 0) {
        const { data: u } = await core.employees().select('id, first_name, last_name, email, employee_code').in('id', userIds)
        users = u || []
      }

      const people = Object.values(personMap).map((p: any) => {
        const student = students.find((s: any) => s.id === p.student_id)
        const employee = users.find((u: any) => u.id === p.user_id)
        const person = student || employee || {}
        return {
          ...p,
          first_name: person.first_name || '',
          last_name: person.last_name || '',
          email: person.email || '',
          code: person.student_code || person.employee_code || '',
          attendanceRate: p.total > 0 ? Math.round(((p.present + p.late) / p.total) * 100) : 0,
        }
      })

      const totalRecords = records?.length || 0
      const totalPresent = (records || []).filter((r: any) => r.status === 'PRESENT' || r.status === 'LATE').length

      return successResponse({
        people,
        summary: {
          totalPeople: people.length,
          totalRecords,
          totalPresent,
          overallRate: totalRecords > 0 ? Math.round((totalPresent / totalRecords) * 100) : 0,
          days,
        }
      }, 'Attendance by person fetched')
    }

    // ── Sessions view (default) ──
    let sessionQuery = ems.attendanceSessions()
      .select('*, courses!inner(id, course_name, course_code)', { count: 'exact' })
      .eq('company_id', companyId)
      .gte('session_date', sinceDate.toISOString().split('T')[0])
      .order('session_date', { ascending: false })
      .range(offset, offset + limit - 1)

    if (courseId) sessionQuery = sessionQuery.eq('course_id', courseId)

    const { data: sessions, error: sessError, count } = await sessionQuery
    if (sessError) return errorResponse(null, sessError.message, 500)

    // Get attendance stats per session from attendance_records
    const sessionIds = (sessions || []).map((s: any) => s.id)
    let recordStats: Record<number, { total: number; present: number }> = {}

    if (sessionIds.length > 0) {
      const { data: records } = await ems.attendanceRecords()
        .select('session_id, status')
        .in('session_id', sessionIds)

      for (const r of records || []) {
        if (!recordStats[r.session_id]) recordStats[r.session_id] = { total: 0, present: 0 }
        recordStats[r.session_id].total++
        if (r.status === 'PRESENT' || r.status === 'LATE') recordStats[r.session_id].present++
      }
    }

    const enrichedSessions = (sessions || []).map((s: any) => {
      const stats = recordStats[s.id] || { total: 0, present: 0 }
      return {
        ...s,
        total_count: stats.total,
        present_count: stats.present,
        attendanceRate: stats.total > 0 ? Math.round((stats.present / stats.total) * 100) : 0,
      }
    })

    // Overall summary stats
    const { data: allSessions } = await ems.attendanceSessions()
      .select('id')
      .eq('company_id', companyId)
      .gte('session_date', sinceDate.toISOString().split('T')[0])

    const allSessionIds = (allSessions || []).map((s: any) => s.id)
    let globalTotal = 0
    let globalPresent = 0

    if (allSessionIds.length > 0) {
      const { data: allRecords } = await ems.attendanceRecords()
        .select('status')
        .in('session_id', allSessionIds)

      globalTotal = allRecords?.length || 0
      globalPresent = (allRecords || []).filter(r => r.status === 'PRESENT' || r.status === 'LATE').length
    }

    return successResponse({
      sessions: enrichedSessions,
      summary: {
        totalSessions: allSessions?.length || 0,
        totalRecords: globalTotal,
        totalPresent: globalPresent,
        overallRate: globalTotal > 0 ? Math.round((globalPresent / globalTotal) * 100) : 0,
        days,
      },
      pagination: {
        page,
        limit,
        total: count ?? 0,
        totalPages: Math.ceil((count ?? 0) / limit)
      }
    }, 'Attendance fetched successfully')
  } catch (error: any) {
    console.error('[HR Attendance GET] Error:', error.message)
    return errorResponse(null, error.message, 500)
  }
}
