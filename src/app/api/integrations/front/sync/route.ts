import { NextResponse } from 'next/server'
import { readConfig, mergeFrontRaw, writeConfig, unmarkAnalyzedSources, getChargebeeCustomers } from '@/lib/storage'
import { syncFront } from '@/lib/front'

export const maxDuration = 300

export async function POST(req: Request) {
  try {
    let config = await readConfig()
    if (!config.front?.bearerToken) {
      return NextResponse.json({ error: 'Front is not configured' }, { status: 400 })
    }

    const url = new URL(req.url)
    const sinceParam = url.searchParams.get('since')
    const limitParam = url.searchParams.get('limit')
    const resetParam = url.searchParams.get('reset') === 'true'
    const perCallLimit = limitParam ? parseInt(limitParam) : 75

    const frontConfig = config.front!

    // Default lookback: 90 days so we catch everything since April.
    // If the integration has been synced recently, use that timestamp instead
    // (unless an explicit since= param was passed, or reset=true).
    const DEFAULT_LOOKBACK_DAYS = 90
    const defaultLookback = new Date()
    defaultLookback.setDate(defaultLookback.getDate() - DEFAULT_LOOKBACK_DAYS)
    defaultLookback.setHours(0, 0, 0, 0)

    const lastSyncedAt = resetParam ? undefined : frontConfig.lastSyncedAt
    const since = sinceParam
      ? new Date(sinceParam)
      : lastSyncedAt
        ? new Date(lastSyncedAt)
        : defaultLookback

    const internalEmails = frontConfig.internalEmails ?? []
    const excludeInboxIds = frontConfig.inboxIds ?? []
    const chargebeeCustomers = await getChargebeeCustomers()
    console.log(`[Front sync] Using ${chargebeeCustomers.length} Chargebee customers for domain filtering`)
    const data = await syncFront(frontConfig.bearerToken!, since, internalEmails, excludeInboxIds, perCallLimit, chargebeeCustomers)
    await mergeFrontRaw(data)

    // Clear ONLY the conversations we actually just re-synced (fresh messages fetched)
    // so they get re-analyzed. Use data.conversations, not merged (which is the full DB).
    const syncedIds = data.conversations.map((c) => c.id)
    const cleared = await unmarkAnalyzedSources(syncedIds)
    console.log(`[Front sync] Cleared ${cleared} conversations from analyzed_sources for re-analysis`)

    const updatedConfig = {
      ...config,
      front: { ...frontConfig, lastSyncedAt: new Date().toISOString() },
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
