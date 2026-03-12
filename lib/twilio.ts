import { getDb } from './db'

function getCredentials() {
  const db = getDb()
  const get = (key: string) =>
    (db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined)?.value || ''

  return {
    accountSid: get('twilio_account_sid') || process.env.TWILIO_ACCOUNT_SID || '',
    authToken: get('twilio_auth_token') || process.env.TWILIO_AUTH_TOKEN || '',
    phoneNumber: get('twilio_phone_number') || process.env.TWILIO_PHONE_NUMBER || '',
    baseUrl: get('base_url') || process.env.BASE_URL || '',
  }
}

export async function sendWhatsAppMessage(to: string, body: string): Promise<string> {
  const { accountSid, authToken, phoneNumber, baseUrl } = getCredentials()
  if (!accountSid || !authToken || !phoneNumber) {
    throw new Error('Twilio credentials not configured')
  }

  const twilio = (await import('twilio')).default
  const client = twilio(accountSid, authToken)

  const toFormatted = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`
  const fromFormatted = phoneNumber.startsWith('whatsapp:') ? phoneNumber : `whatsapp:${phoneNumber}`

  const params: Record<string, string> = {
    from: fromFormatted,
    to: toFormatted,
    body,
  }

  if (baseUrl) {
    params.statusCallback = `${baseUrl.replace(/\/$/, '')}/api/twilio/status`
  }

  const message = await client.messages.create(params)
  return message.sid
}
