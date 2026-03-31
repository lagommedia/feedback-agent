import { NextResponse } from 'next/server'
import { readConfig, mergeFrontRaw, writeConfig } from '@/lib/storage'
import { syncFront } from '@/lib/front'

export const maxDuration = 300

export async function POST() {
  try {
    const config = await readConfig()
    if (!config.front?.bearerToken) {
      return NextResponse.json({ error: 'Front is not configured' }, { status: 400 })
    }

    const initialStart = new Date('2026-01-01')
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    yesterday.setHours(0, 0, 0, 0)
    const since = config.front.lastSyncedAt ? yesterday : initialStart

    const data = await syncFront(config.front.bearerToken, since)
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
