import { NextResponse } from 'next/server'
import { listModels, resolveModel, cachedLatestOpus } from '@/lib/models'

export async function GET() {
  try {
    const models = await listModels()
    // Haalt ook de nieuwste Opus op als die nog niet bekend is, voor het "Automatisch"-label
    const current = await resolveModel()
    return NextResponse.json({ models, latestOpus: cachedLatestOpus(), current })
  } catch (e) {
    return NextResponse.json({
      models: [],
      latestOpus: cachedLatestOpus(),
      error: e instanceof Error ? e.message : 'Modellen ophalen mislukt',
    })
  }
}
