import { NextRequest } from 'next/server'
import { successResponse, errorResponse } from '@/lib/errorHandler'
import { processDueReminders } from '@/lib/jobs/dueReminders'

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return errorResponse(null, 'Unauthorized', 401)
    }

    const result = await processDueReminders()
    return successResponse(result, 'Due reminders processed')
  } catch (error: any) {
    console.error('[Cron DueReminders] Error:', error.message)
    return errorResponse(null, error.message, 500)
  }
}
