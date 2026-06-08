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

    const menuAccess = await requireMenuAccessAppRouter(req, 'ems.hr.enrollments')
    if (menuAccess instanceof Response) return menuAccess

    const scope = await getUserTenantScope(userId)
    if (!scope?.companyId) return errorResponse(null, 'Company context not found', 400)

    const { searchParams } = new URL(req.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '10')
    const offset = (page - 1) * limit
    const search = searchParams.get('search') || ''
    const status = searchParams.get('status') || null

    const companyId = scope.companyId

    const cacheKey = `ems_hr_enrollments:${companyId}:${page}:${limit}:${search}:${status || 'all'}`
    const cached = await dataCache.get(cacheKey)
    if (cached) return successResponse(cached, 'Enrollments fetched successfully (cached)')

    let query = ems.enrollments()
      .select('*, students!inner(id, first_name, last_name, email, phone), courses!inner(id, course_name, course_code)', { count: 'exact' })
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (status) query = query.eq('enrollment_status', status)
    if (search) {
      query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%`, { foreignTable: 'students' })
    }

    const { data, error, count } = await query

    if (error) return errorResponse(null, error.message, 500)

    const responseData = {
      data: data || [],
      pagination: {
        page,
        limit,
        total: count ?? 0,
        totalPages: Math.ceil((count ?? 0) / limit)
      }
    }

    await dataCache.set(cacheKey, responseData, CACHE_TTL)
    return successResponse(responseData, 'Enrollments fetched successfully')
  } catch (error: any) {
    console.error('[HR Enrollments GET] Error:', error.message)
    return errorResponse(null, error.message, 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await getUserIdFromToken(req)
    if (!userId) return errorResponse(null, 'Unauthorized', 401)

    const menuAccess = await requireMenuAccessAppRouter(req, 'ems.hr.students.enroll')
    if (menuAccess instanceof Response) return menuAccess

    const scope = await getUserTenantScope(userId)
    if (!scope?.companyId) return errorResponse(null, 'Company context not found', 400)

    const body = await req.json()
    const { student_id, course_id, batch_id } = body

    if (!student_id || !course_id) {
      return errorResponse(null, 'student_id and course_id are required', 400)
    }

    const companyId = scope.companyId

    const { data, error } = await ems.enrollments().insert({
      company_id: companyId,
      student_id,
      course_id,
      batch_id: batch_id || null,
      enrollment_status: 'active',
      created_at: new Date().toISOString(),
    }).select().single()

    if (error) return errorResponse(null, error.message, 500)

    return successResponse(data, 'Student enrolled successfully')
  } catch (error: any) {
    console.error('[HR Enrollments POST] Error:', error.message)
    return errorResponse(null, error.message, 500)
  }
}
