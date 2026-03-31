import { NextResponse } from 'next/server'
import { mergeAvomaRaw, readConfig, writeConfig } from '@/lib/storage'
import { syncAvoma } from '@/lib/avoma'

export const maxDuration = 300

export async function POST() {
  try {
    const config = await readConfig()
    if (!config.avoma?.apiKey) {
      return NextResponse.json({ error: 'Avoma is not configured' }, { status: 400 })
    }

    const initialStart = new Date('2026-01-01')
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    yesterday.setHours(0, 0, 0, 0)
    const since = config.avoma.lastSyncedAt ? yesterday : initialStart

    const data = await syncAvoma(config.avoma.apiKey, since)
    const merged = await mergeAvomaRaw(data)

    // Update last synced
    const updatedConfig = { ...config, avoma: { ...config.avoma, lastSyncedAt: new Date().toISOString() } }
    await writeConfig(updatedConfig)

    return NextResponse.json({
      source: 'avoma',
      status: 'success',
      count: merged.transcripts.length,
    })
  } catch (err) {
    console.error('Avoma sync error:', err)
    return NextResponse.json(
      { source: 'avoma', status: 'error', count: 0, error: String(err) },
      { status: 500 }
    )
  }
}
