import { NextRequest, NextResponse } from 'next/server'
import { supabase } from './supabase'
import { getUserIdFromToken } from './jwt'
import { getUserTenantScope } from '@/middleware/tenantFilter'
import { getCachedData, cacheData } from './redis'

const MENU_CACHE_TTL = 5 * 60 * 1000

function getCacheKey(userId: number, companyId: number | null): string {
  return `menu_ids:${userId}:${companyId ?? 'global'}`
}

export async function getUserMenuIdsAppRouter(
  userId: number,
  companyId: number | null
): Promise<string[]> {
  const cacheKey = getCacheKey(userId, companyId)
  const cached = await getCachedData<string[]>(cacheKey)
  if (cached && cached.length > 0) return cached

  // 1. System role menus (app_auth.role_menu_permissions → menu_registry.menu_key)
  let systemQuery = supabase
    .schema('app_auth')
    .from('user_roles')
    .select(`
      company_id,
      roles!inner(
        role_menu_permissions!inner(
          menu_id,
          menu_registry!inner(menu_key)
        )
      )
    `)
    .eq('user_id', userId)
    .eq('is_active', true)

  // Platform admins (company_id IS NULL) see all menus scoped to their role
  if (companyId) {
    systemQuery = systemQuery.or(`company_id.eq.${companyId},company_id.is.null`)
  }

  const { data: systemData, error: systemError } = await systemQuery
  if (systemError) {
    console.error('[menuAccessAppRouter] System menu fetch error:', systemError)
  }

  const systemMenuIds = new Set<string>()
  systemData?.forEach((row: any) => {
    const menus = row.roles?.role_menu_permissions || []
    menus.forEach((rmp: any) => {
      const key = rmp.menu_registry?.menu_key
      if (key) systemMenuIds.add(key)
    })
  })

  // 2. Dynamic role menus (ems.dynamic_user_roles → ems.dynamic_roles.menu_ids)
  if (companyId) {
    const { data: dynamicData, error: dynamicError } = await supabase
      .schema('ems')
      .from('dynamic_user_roles')
      .select(`
        roles:role_id!inner(
          menu_ids
        )
      `)
      .eq('user_id', userId)
      .eq('company_id', companyId)
      .eq('is_active', true)

    if (dynamicError) {
      console.error('[menuAccessAppRouter] Dynamic menu fetch error:', dynamicError)
    }

    dynamicData?.forEach((row: any) => {
      const ids: string[] = row.roles?.menu_ids || []
      ids.forEach(id => systemMenuIds.add(id))
    })
  }

  const result = Array.from(systemMenuIds)

  // Fallback: if NO menu permissions found (seed data not run),
  // grant ALL EMS menus so the app works without seed SQL.
  if (result.length === 0) {
    const allKeys = [
      'ems.dashboard', 'ems.dashboard.student', 'ems.dashboard.tutor', 'ems.dashboard.mapping',
      'ems.students', 'ems.students.edit', 'ems.students.profile', 'ems.students.courses',
      'ems.students.assignments', 'ems.students.assignments.view', 'ems.students.assignments.submit',
      'ems.students.materials', 'ems.students.quizzes', 'ems.students.quizzes.view',
      'ems.students.quizzes.start', 'ems.students.quizzes.submit', 'ems.students.quizzes.questions',
      'ems.tutors', 'ems.tutors.edit',
      'ems.courses', 'ems.courses.edit', 'ems.courses.tutors', 'ems.courses.tutors.assign',
      'ems.batches', 'ems.batches.edit',
      'ems.materials', 'ems.materials.edit',
      'ems.assignments', 'ems.assignments.edit', 'ems.assignments.grade',
      'ems.assignments.submit', 'ems.assignments.submissions',
      'ems.quizzes', 'ems.quizzes.edit', 'ems.quizzes.questions',
      'ems.quizzes.attempts', 'ems.quizzes.attempts.recent',
      'ems.live_classes', 'ems.live_classes.edit', 'ems.live_classes.status',
      'ems.attendance', 'ems.attendance.mark', 'ems.attendance.class', 'ems.attendance.verify',
      'ems.doubts', 'ems.approvals', 'ems.certificates', 'ems.reports',
      'ems.reports.analytics', 'ems.reports.progress',
      'ems.finance.invoices', 'ems.finance.payments', 'ems.finance.fees', 'ems.finance.expenses', 'ems.finance.due_tracking',
      'ems.hr.tutors', 'ems.hr.tutors.view', 'ems.hr.tutors.assign',
      'ems.hr.students', 'ems.hr.students.enroll', 'ems.hr.students.bulk_enroll',
      'ems.hr.enrollments', 'ems.hr.enrollments.view',
      'ems.hr.attendance', 'ems.hr.attendance.reports', 'ems.hr.attendance.export',
      'ems.hr.bulk_import',
      'ems.settings', 'ems.enrollments', 'ems.enrollments.edit',
      'ems.face_profile', 'ems.face_profile.register', 'ems.face_profile.verify',
      'ems.practice', 'ems.practice.dashboard', 'ems.practice.allocate',
      'ems.practice.gst', 'ems.practice.gst.invoice', 'ems.practice.it',
      'ems.practice.tds', 'ems.practice.reset', 'ems.practice.status',
      'ems.content.lessons', 'ems.content.lessons.edit', 'ems.content.modules',
      'ems.progress', 'ems.analytics',
      'ems.tutor.students', 'ems.tutor.submissions'
    ]
    await cacheData(cacheKey, allKeys, MENU_CACHE_TTL)
    return allKeys
  }

  await cacheData(cacheKey, result, MENU_CACHE_TTL)
  return result
}

export async function requireMenuAccessAppRouter(
  req: NextRequest,
  requiredMenuId: string
): Promise<{ userId: number; companyId: number | null; menuIds: string[] } | NextResponse> {
  let userId: number | null = null

  // Try x-user-id header first (set by middleware)
  const headerUserId = req.headers.get('x-user-id')
  if (headerUserId) {
    userId = parseInt(headerUserId, 10)
  }

  // Fallback: extract from JWT
  if (!userId || isNaN(userId)) {
    userId = await getUserIdFromToken(req)
  }

  if (!userId) {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
      { status: 401 }
    )
  }

  // Get company context
  const headerCompanyId = req.headers.get('x-company-id')
  let companyId: number | null = headerCompanyId ? parseInt(headerCompanyId, 10) : null

  // Fallback: get from tenant scope
  if (!companyId) {
    try {
      const scope = await getUserTenantScope(userId)
      companyId = scope.companyId
    } catch {
      return NextResponse.json(
        { success: false, error: { code: 'TENANT_ERROR', message: 'Could not resolve tenant scope' } },
        { status: 403 }
      )
    }
  }

  const menuIds = await getUserMenuIdsAppRouter(userId, companyId)

  if (!menuIds.includes(requiredMenuId)) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'FORBIDDEN_MENU',
          message: `Access denied: '${requiredMenuId}' not assigned`
        }
      },
      { status: 403 }
    )
  }

  return { userId, companyId, menuIds }
}
