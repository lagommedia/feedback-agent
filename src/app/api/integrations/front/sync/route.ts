import { NextResponse } from 'next/server'
import { readConfig, mergeFrontRaw, writeConfig, unmarkAnalyzedSources } from '@/lib/storage'
import { syncFront } from '@/lib/front'

export const maxDuration = 300

export async function POST(req: Request) {
  try {
    const config = await readConfig()
    if (!config.front?.bearerToken) {
      return NextResponse.json({ error: 'Front is not configured' }, { status: 400 })
    }

    const url = new URL(req.url)
    const sinceParam = url.searchParams.get('since')
    const limitParam = url.searchParams.get('limit')
    const perCallLimit = limitParam ? parseInt(limitParam) : 75

    const MAX_LOOKBACK_DAYS = 7
    const maxLookback = new Date()
    maxLookback.setDate(maxLookback.getDate() - MAX_LOOKBACK_DAYS)
    maxLookback.setHours(0, 0, 0, 0)

    const lastSyncedAt = config.front.lastSyncedAt
    const since = sinceParam
      ? new Date(sinceParam)
      : lastSyncedAt
        ? new Date(Math.max(new Date(lastSyncedAt).getTime(), maxLookback.getTime()))
        : maxLookback

    const internalEmails = config.front.internalEmails ?? []
    const inboxIds = config.front.inboxIds ?? []
    const data = await syncFront(config.front.bearerToken, since, internalEmails, inboxIds, perCallLimit)
    await mergeFrontRaw(data)

    // Clear ONLY the conversations we actually just re-synced (fresh messages fetched)
    // so they get re-analyzed. Use data.conversations, not merged (which is the full DB).
    const syncedIds = data.conversations.map((c) => c.id)
    const cleared = await unmarkAnalyzedSources(syncedIds)
    console.log(`[Front sync] Cleared ${cleared} conversations from analyzed_sources for re-analysis`)

    const updatedConfig = {
      ...config,
      front: { ...config.front, lastSyncedAt: new Date().toISOString() },
    }
    await writeConfig(updatedConfig)

    return NextResponse.json({
      source: 'front',
      status: 'success',
      count: data.conversations.length,
      clearedForReanalysis: cleared,
      limit: perCallLimit,
    })
  } catch (err) {
    console.error('Front sync error:', err)
    return NextResponse.json(
      { source: 'front', status: 'error', count: 0, error: String(err) },
      { status: 500 }
    )
  }
}
