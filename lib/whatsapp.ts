import axios from 'axios'

interface FeeReminderParams {
  phone: string
  parentName: string
  studentName: string
  amount: number
  dueDate: string
  paymentLink: string
  lateFee?: number
}

export async function sendFeeReminder({
  phone,
  parentName,
  studentName,
  amount,
  dueDate,
  paymentLink,
  lateFee
}: FeeReminderParams) {
  const totalAmount = lateFee ? amount + lateFee : amount
  const lateFeeLine = lateFee ? `\nLate Fee: ₹${lateFee}` : ''

  const message = `Hi ${parentName},

Fee Reminder for ${studentName} 📚

Amount Due: ₹${amount}${lateFeeLine}
Total Payable: ₹${totalAmount}
Due Date: ${dueDate}

Pay Now: ${paymentLink}

Thank you,
Agaran Coaching Centre`

  const apiKey = process.env.WATI_API_KEY
  if (!apiKey) {
    console.log('[WhatsApp] WATI_API_KEY not set. Would send:', message)
    return { sent: false, provider: 'mock', message }
  }

  try {
    await axios.post('https://api.wati.io/v1/sendMessage', {
      phone,
      message
    }, {
      headers: { Authorization: `Bearer ${apiKey}` }
    })
    console.log(`[WhatsApp] Sent to ${phone}: ₹${totalAmount} due ${dueDate}`)
    return { sent: true, provider: 'wati', message }
  } catch (err: any) {
    console.error('[WhatsApp] Failed:', err.message)
    return { sent: false, provider: 'wati', error: err.message }
  }
}
