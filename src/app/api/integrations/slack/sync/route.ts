import { NextResponse } from 'next/server'
import { readConfig, readSlackRaw, writeSlackRaw, writeConfig } from '@/lib/storage'
import { syncSlack } from '@/lib/slack'

export const maxDuration = 300

export async function POST() {
  try {
    const config = await readConfig()
    if (!config.slack?.botToken) {
      return NextResponse.json({ error: 'Slack is not configured' }, { status: 400 })
    }

    const channelIds = config.slack.channelIds ?? []
    if (channelIds.length === 0) {
      return NextResponse.json(
        { error: 'No Slack channels configured. Add channel IDs in the integration settings.' },
        { status: 400 }
      )
    }

    const initialStart = new Date('2026-03-01')
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    yesterday.setHours(0, 0, 0, 0)
    const since = config.slack.lastSyncedAt ? yesterday : initialStart

    const data = await syncSlack(config.slack.botToken, channelIds, since)
    await writeSlackRaw(data)

    const updatedConfig = {
      ...config,
      slack: { ...config.slack, lastSyncedAt: new Date().toISOString() },
    }
    await writeConfig(updatedConfig)

    return NextResponse.json({
      source: 'slack',
      status: 'success',
      count: data.messages.length,
    })
  } catch (err) {
    console.error('Slack sync error:', err)
    return NextResponse.json(
      { source: 'slack', status: 'error', count: 0, error: String(err) },
      { status: 500 }
    )
  }
}
