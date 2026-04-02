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

export async function sendWhatsAppMessage(to: string, body: string, mediaUrls?: string[]): Promise<string> {
  const { accountSid, authToken, phoneNumber, baseUrl } = getCredentials()
  if (!accountSid || !authToken || !phoneNumber) {
    throw new Error('Twilio credentials not configured')
  }

  const twilio = (await import('twilio')).default
  const client = twilio(accountSid, authToken)

  const toFormatted = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`
  const fromFormatted = phoneNumber.startsWith('whatsapp:') ? phoneNumber : `whatsapp:${phoneNumber}`

  const params = {
    from: fromFormatted,
    to: toFormatted,
    body,
    ...(baseUrl ? { statusCallback: `${baseUrl.replace(/\/$/, '')}/api/twilio/status` } : {}),
    ...(mediaUrls?.length ? { mediaUrl: mediaUrls } : {}),
  }

  const message = await client.messages.create(params as Parameters<typeof client.messages.create>[0])
  return message.sid
}

export async function sendWhatsAppTemplate(
  to: string,
  contentSid: string,
  contentVariables: Record<string, string>
): Promise<string> {
  const { accountSid, authToken, phoneNumber, baseUrl } = getCredentials()
  if (!accountSid || !authToken || !phoneNumber) {
    throw new Error('Twilio credentials not configured')
  }

  const twilio = (await import('twilio')).default
  const client = twilio(accountSid, authToken)

  const toFormatted = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`
  const fromFormatted = phoneNumber.startsWith('whatsapp:') ? phoneNumber : `whatsapp:${phoneNumber}`

  const message = await client.messages.create({
    from: fromFormatted,
    to: toFormatted,
    contentSid,
    contentVariables: JSON.stringify(contentVariables),
    ...(baseUrl ? { statusCallback: `${baseUrl.replace(/\/$/, '')}/api/twilio/status` } : {}),
  })
  return message.sid
}
