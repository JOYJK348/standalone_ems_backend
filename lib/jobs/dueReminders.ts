import { ems } from '@/lib/supabase'
import { sendFeeReminder } from '@/lib/whatsapp'
import crypto from 'crypto'

interface DueItem {
  id: number
  company_id: number
  student_id: number
  amount_due: number
  due_date: string
  late_fee_applied: number
  students: {
    id: number
    first_name: string
    last_name: string
    phone: string
  }
}

export async function processDueReminders() {
  const today = new Date().toISOString().split('T')[0]

  const { data: dues, error } = await ems.dueReminders()
    .select('*, students!inner(id, first_name, last_name, phone, parent_phone, parent_name)')
    .eq('reminder_sent', false)
    .eq('payment_received', false)
    .lte('due_date', today)
    .limit(100)

  if (error || !dues) {
    console.error('[DueReminders] Fetch error:', error?.message)
    return { processed: 0, errors: 1 }
  }

  let sent = 0
  let failed = 0

  for (const due of dues as DueItem[]) {
    try {
      const linkId = crypto.randomUUID().slice(0, 8).toUpperCase()
      const paymentLink = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/pay/${linkId}`

      const result = await sendFeeReminder({
        phone: due.students.phone,
        parentName: `${due.students.first_name}'s Parent`,
        studentName: `${due.students.first_name} ${due.students.last_name}`,
        amount: due.amount_due,
        dueDate: due.due_date,
        paymentLink,
        lateFee: due.late_fee_applied || 0
      })

      await ems.dueReminders()
        .update({
          reminder_sent: true,
          sent_via: result.sent ? 'WHATSAPP' : 'MOCK',
          reminder_date: new Date().toISOString()
        })
        .eq('id', due.id)

      if (result.sent) sent++; else failed++
    } catch (err: any) {
      console.error(`[DueReminders] Error processing due ${due.id}:`, err.message)
      failed++
    }
  }

  console.log(`[DueReminders] Processed: ${dues.length}, Sent: ${sent}, Failed: ${failed}`)
  return { processed: dues.length, sent, failed }
}
