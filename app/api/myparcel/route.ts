import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'

const MYPARCEL_API = 'https://api.myparcel.nl'

const PACKAGE_TYPES: Record<string, number> = {
  ongefrankeerd: 4,
  brievenbuspakje: 2,
  klein_pakket: 1,
  normaal_pakket: 1,
}

function getApiKey(): string {
  const db = getDb()
  return (
    (db.prepare('SELECT value FROM settings WHERE key = ?').get('myparcel_api_key') as { value: string } | undefined)
      ?.value || ''
  )
}

function parseStreet(address1: string): { street: string; number: string; number_suffix: string } {
  const match = address1.trim().match(/^(.*?)\s+(\d+)\s*([A-Za-z-]*)$/)
  if (match) {
    return { street: match[1].trim(), number: match[2], number_suffix: match[3].trim() }
  }
  return { street: address1, number: '', number_suffix: '' }
}

function authHeader(apiKey: string): string {
  return `basic ${Buffer.from(apiKey).toString('base64')}`
}

export async function POST(req: NextRequest) {
  const { shipping, order_number, package_type } = await req.json()

  if (!shipping) return NextResponse.json({ error: 'Verzendadres ontbreekt' }, { status: 400 })

  const apiKey = getApiKey()
  if (!apiKey) return NextResponse.json({ error: 'MyParcel API key niet ingesteld in Instellingen' }, { status: 400 })

  const { street, number, number_suffix } = parseStreet(shipping.address_1 || '')
  const pkgType = PACKAGE_TYPES[package_type] ?? 4

  const recipient: Record<string, string> = {
    cc: shipping.country || 'NL',
    city: shipping.city || '',
    street: street,
    number: number,
    postal_code: (shipping.postcode || '').replace(/\s/g, ''),
    person: `${shipping.first_name || ''} ${shipping.last_name || ''}`.trim(),
  }
  if (number_suffix) recipient.number_suffix = number_suffix

  const shipmentPayload = {
    data: {
      shipments: [
        {
          recipient,
          options: {
            package_type: pkgType,
            ...(order_number ? { label_description: `Bestelling ${order_number}` } : {}),
          },
          carrier: 1,
        },
      ],
    },
  }

  let shipmentData: { data?: { ids?: number[] } }
  try {
    const res = await fetch(`${MYPARCEL_API}/shipments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/vnd.shipment+json;charset=utf-8',
        Authorization: authHeader(apiKey),
        Accept: 'application/json',
      },
      body: JSON.stringify(shipmentPayload),
    })

    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json({ error: `MyParcel fout (${res.status}): ${text}` }, { status: 500 })
    }

    shipmentData = await res.json()
  } catch (e) {
    return NextResponse.json({ error: `Verbindingsfout: ${e instanceof Error ? e.message : String(e)}` }, { status: 500 })
  }

  const ids = shipmentData.data?.ids
  if (!ids?.length) return NextResponse.json({ error: 'Geen zending ID ontvangen van MyParcel' }, { status: 500 })

  const shipmentId = ids[0]

  // Try to get label URL — may take a moment to generate
  let labelUrl: string | null = null
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, 1500))
    try {
      const labelRes = await fetch(`${MYPARCEL_API}/shipment_labels/${shipmentId}?format=A4`, {
        headers: {
          Authorization: authHeader(apiKey),
          Accept: 'application/json',
        },
        redirect: 'manual',
      })

      if (labelRes.status === 200) {
        const labelData = await labelRes.json() as { data?: { pdfs?: { url?: string } } }
        labelUrl = labelData.data?.pdfs?.url || null
        if (labelUrl) break
      } else if (labelRes.status === 301 || labelRes.status === 302) {
        labelUrl = labelRes.headers.get('Location')
        if (labelUrl) break
      }
    } catch { /* retry */ }
  }

  return NextResponse.json({ success: true, shipment_id: shipmentId, label_url: labelUrl })
}
