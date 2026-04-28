import { NextResponse } from 'next/server'
import { mergeAvomaRaw, readConfig, writeConfig, getStoredTranscriptUuids } from '@/lib/storage'
import { syncAvoma } from '@/lib/avoma'

export const maxDuration = 300

export async function POST(req: Request) {
  try {
    const config = await readConfig()
    if (!config.avoma?.apiKey) {
      return NextResponse.json({ error: 'Avoma is not configured' }, { status: 400 })
    }

    const sinceParam = new URL(req.url).searchParams.get('since')
    // Default cap: 1 day. Keeps Avoma API usage low on daily syncs.
    // Pass ?since=YYYY-MM-DD explicitly for manual backfills.
    const MAX_LOOKBACK_DAYS = 1
    const maxLookback = new Date()
    maxLookback.setDate(maxLookback.getDate() - MAX_LOOKBACK_DAYS)
    maxLookback.setHours(0, 0, 0, 0)

    const lastSyncedAt = config.avoma.lastSyncedAt
    const since = sinceParam
      ? new Date(sinceParam)
      : lastSyncedAt
        ? new Date(Math.max(new Date(lastSyncedAt).getTime(), maxLookback.getTime()))
        : maxLookback

    const knownUuids = await getStoredTranscriptUuids()
    const data = await syncAvoma(config.avoma.apiKey, since, knownUuids)
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
