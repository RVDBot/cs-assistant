import { NextResponse } from 'next/server'
import { migrateExistingMedia } from '@/lib/media'
import { log } from '@/lib/logger'

export async function POST() {
  try {
    const result = await migrateExistingMedia()
    log('info', 'media', `Media migratie voltooid: ${result.migrated} gemigreerd, ${result.failed} mislukt`)
    return NextResponse.json(result)
  } catch (e) {
    log('error', 'media', 'Media migratie mislukt', { error: e instanceof Error ? e.message : String(e) })
    return NextResponse.json({ error: 'Migration failed' }, { status: 500 })
  }
}
