import { NextRequest } from 'next/server'
import { successResponse, errorResponse } from '@/lib/errorHandler'
import { getUserIdFromToken } from '@/lib/jwt'
import { getUserTenantScope } from '@/middleware/tenantFilter'
import { requireMenuAccessAppRouter } from '@/lib/menuAccessAppRouter'
import { ems, core } from '@/lib/supabase'
import { dataCache } from '@/lib/cache/dataCache'

const CACHE_TTL = 60 * 1000

export async function GET(req: NextRequest) {
  try {
    const userId = await getUserIdFromToken(req)
    if (!userId) return errorResponse(null, 'Unauthorized', 401)

    const menuAccess = await requireMenuAccessAppRouter(req, 'ems.hr.tutors')
    if (menuAccess instanceof Response) return menuAccess

    const scope = await getUserTenantScope(userId)
    if (!scope?.companyId) return errorResponse(null, 'Company context not found', 400)

    const { searchParams } = new URL(req.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const offset = (page - 1) * limit
    const search = searchParams.get('search') || ''
    const companyId = scope.companyId

    const cacheKey = `ems_hr_tutors:${companyId}:${page}:${limit}:${search}`
    const cached = await dataCache.get(cacheKey)
    if (cached) return successResponse(cached, 'Tutors fetched successfully (cached)')

    let empQuery = core.employees()
      .select('*', { count: 'exact' })
      .eq('company_id', companyId)
      .is('deleted_at', null)
    if (search) {
      empQuery = empQuery.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%,employee_code.ilike.%${search}%`)
    }
    const { data: employees, error: empError, count } = await empQuery
      .order('first_name', { ascending: true })
      .range(offset, offset + limit - 1)

    if (empError) return errorResponse(null, empError.message, 500)

    const tutorIds = (employees || []).map((e: any) => e.id)

    const { data: courseTutors } = await ems.courseTutors()
      .select('tutor_id, courses!inner(id, course_name, course_code)')
      .in('tutor_id', tutorIds.length > 0 ? tutorIds : [0])
      .is('deleted_at', null)

    const tutorCourseMap: Record<number, any[]> = {}
    for (const ct of courseTutors || []) {
      if (!tutorCourseMap[ct.tutor_id]) tutorCourseMap[ct.tutor_id] = []
      tutorCourseMap[ct.tutor_id].push(ct.courses)
    }

    const tutors = (employees || []).map((emp: any) => ({
      ...emp,
      courses: tutorCourseMap[emp.id] || [],
      courseCount: tutorCourseMap[emp.id]?.length || 0,
    }))

    const responseData = {
      data: tutors,
      pagination: {
        page,
        limit,
        total: count ?? 0,
        totalPages: Math.ceil((count ?? 0) / limit)
      }
    }

    await dataCache.set(cacheKey, responseData, CACHE_TTL)
    return successResponse(responseData, 'Tutors fetched successfully')
  } catch (error: any) {
    console.error('[HR Tutors GET] Error:', error.message)
    return errorResponse(null, error.message, 500)
  }
}
