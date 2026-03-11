import { getDb } from './db'

function getCredentials() {
  const db = getDb()
  const get = (key: string) =>
    (db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined)?.value || ''

  return {
    accountSid: get('twilio_account_sid') || process.env.TWILIO_ACCOUNT_SID || '',
    authToken: get('twilio_auth_token') || process.env.TWILIO_AUTH_TOKEN || '',
    phoneNumber: get('twilio_phone_number') || process.env.TWILIO_PHONE_NUMBER || '',
  }
}

export async function sendWhatsAppMessage(to: string, body: string): Promise<string> {
  const { accountSid, authToken, phoneNumber } = getCredentials()
  if (!accountSid || !authToken || !phoneNumber) {
    throw new Error('Twilio credentials not configured')
  }

  // Dynamic import to avoid issues during build
  const twilio = (await import('twilio')).default
  const client = twilio(accountSid, authToken)

  const toFormatted = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`
  const fromFormatted = phoneNumber.startsWith('whatsapp:') ? phoneNumber : `whatsapp:${phoneNumber}`

  const message = await client.messages.create({
    from: fromFormatted,
    to: toFormatted,
    body,
  })

  return message.sid
}

export function validateTwilioSignature(
  signature: string,
  url: string,
  params: Record<string, string>
): boolean {
  try {
    const { accountSid, authToken } = getCredentials()
    if (!authToken) return false
    const twilio = require('twilio')
    return twilio.validateRequest(authToken, signature, url, params)
  } catch {
    return false
  }
}
