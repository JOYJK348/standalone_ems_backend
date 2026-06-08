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

    const menuAccess = await requireMenuAccessAppRouter(req, 'ems.hr.bulk_import')
    if (menuAccess instanceof Response) return menuAccess

    const scope = await getUserTenantScope(userId)
    if (!scope?.companyId) return errorResponse(null, 'Company context not found', 400)

    return successResponse({
      imports: [],
      stats: { totalImports: 0, successful: 0, failed: 0 }
    }, 'Bulk import history fetched')
  } catch (error: any) {
    console.error('[HR BulkImport GET] Error:', error.message)
    return errorResponse(null, error.message, 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await getUserIdFromToken(req)
    if (!userId) return errorResponse(null, 'Unauthorized', 401)

    const menuAccess = await requireMenuAccessAppRouter(req, 'ems.hr.bulk_import')
    if (menuAccess instanceof Response) return menuAccess

    const scope = await getUserTenantScope(userId)
    if (!scope?.companyId) return errorResponse(null, 'Company context not found', 400)

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const importType = formData.get('type') as string || 'students'

    if (!file) return errorResponse(null, 'CSV file is required', 400)
    if (!['students', 'tutors'].includes(importType)) return errorResponse(null, 'Invalid import type', 400)

    const csvText = await file.text()
    const lines = csvText.trim().split('\n')
    if (lines.length < 2) return errorResponse(null, 'CSV must have a header row and at least one data row', 400)

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase())
    const requiredHeaders = ['first_name', 'last_name', 'email']
    for (const h of requiredHeaders) {
      if (!headers.includes(h)) return errorResponse(null, `Missing required column: ${h}`, 400)
    }

    const companyId = scope.companyId
    let imported = 0
    let failed = 0
    const errors: string[] = []

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim())
      if (values.length !== headers.length || values.every(v => !v)) continue

      const row: Record<string, string> = {}
      headers.forEach((h, idx) => { row[h] = values[idx] || '' })

      try {
        if (importType === 'students') {
          await ems.students().insert({
            company_id: companyId,
            branch_id: scope.branchId || null,
            first_name: row.first_name,
            last_name: row.last_name || '',
            email: row.email,
            phone: row.phone || '',
            student_code: row.student_code || `STU-${Date.now()}-${i}`,
            status: 'ACTIVE',
            is_active: true,
          })
        } else {
          await core.employees().insert({
            company_id: companyId,
            branch_id: scope.branchId || null,
            first_name: row.first_name,
            last_name: row.last_name || '',
            email: row.email,
            phone: row.phone || '',
            employee_code: row.employee_code || `EMP-${Date.now()}-${i}`,
            is_active: true,
          })
        }
        imported++
      } catch (err: any) {
        failed++
        errors.push(`Row ${i}: ${err.message || 'Insert failed'}`)
      }
    }

    return successResponse({
      imported,
      failed,
      total: imported + failed,
      errors: errors.slice(0, 10),
    }, `Import completed: ${imported} records imported, ${failed} failed`)
  } catch (error: any) {
    console.error('[HR BulkImport POST] Error:', error.message)
    return errorResponse(null, error.message, 500)
  }
}
