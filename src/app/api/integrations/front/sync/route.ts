import { NextResponse } from 'next/server'
import { readConfig, mergeFrontRaw, writeConfig } from '@/lib/storage'
import { syncFront } from '@/lib/front'

export const maxDuration = 300

export async function POST(req: Request) {
  try {
    const config = await readConfig()
    if (!config.front?.bearerToken) {
      return NextResponse.json({ error: 'Front is not configured' }, { status: 400 })
    }

    const sinceParam = new URL(req.url).searchParams.get('since')
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
    const data = await syncFront(config.front.bearerToken, since, internalEmails, inboxIds)
    const merged = await mergeFrontRaw(data)

    const updatedConfig = {
      ...config,
      front: { ...config.front, lastSyncedAt: new Date().toISOString() },
    }
    await writeConfig(updatedConfig)

    return NextResponse.json({
      source: 'front',
      status: 'success',
      count: merged.conversations.length,
    })
  } catch (err) {
    console.error('Front sync error:', err)
    return NextResponse.json(
      { source: 'front', status: 'error', count: 0, error: String(err) },
      { status: 500 }
    )
  }
}
