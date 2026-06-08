import { NextRequest } from 'next/server'
import { successResponse, errorResponse } from '@/lib/errorHandler'
import { getUserIdFromToken } from '@/lib/jwt'
import { getUserTenantScope } from '@/middleware/tenantFilter'
import { requireMenuAccessAppRouter } from '@/lib/menuAccessAppRouter'
import { ems, core } from '@/lib/supabase'
import { dataCache } from '@/lib/cache/dataCache'

const CACHE_TTL = 60 * 1000

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = await getUserIdFromToken(req)
    if (!userId) return errorResponse(null, 'Unauthorized', 401)

    const menuAccess = await requireMenuAccessAppRouter(req, 'ems.hr.tutors')
    if (menuAccess instanceof Response) return menuAccess

    const scope = await getUserTenantScope(userId)
    if (!scope?.companyId) return errorResponse(null, 'Company context not found', 400)

    const tutorId = parseInt(params.id)
    if (!tutorId) return errorResponse(null, 'Invalid tutor ID', 400)

    const companyId = scope.companyId

    const cacheKey = `ems_hr_tutor:${tutorId}:${companyId}`
    const cached = await dataCache.get(cacheKey)
    if (cached) return successResponse(cached, 'Tutor details fetched successfully (cached)')

    const { data: employee, error: empError } = await core.employees()
      .select('*')
      .eq('id', tutorId)
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .single()

    if (empError) return errorResponse(null, empError.message, 500)
    if (!employee) return errorResponse(null, 'Tutor not found', 404)

    const { data: courseTutors, error: ctError } = await ems.courseTutors()
      .select('id, tutor_role, is_primary, courses!inner(id, course_name, course_code, course_description, status, duration_hours)')
      .eq('tutor_id', tutorId)
      .eq('company_id', companyId)
      .is('deleted_at', null)

    if (ctError) return errorResponse(null, ctError.message, 500)

    const courses = (courseTutors || []).map((ct: any) => ({
      ...ct.courses,
      tutor_role: ct.tutor_role,
      is_primary: ct.is_primary,
      assignment_id: ct.id,
    }))

    const responseData = {
      tutor: {
        ...employee,
        courses,
        courseCount: courses.length,
      }
    }

    await dataCache.set(cacheKey, responseData, CACHE_TTL)
    return successResponse(responseData, 'Tutor details fetched successfully')
  } catch (error: any) {
    console.error('[HR Tutor Detail GET] Error:', error.message)
    return errorResponse(null, error.message, 500)
  }
}
