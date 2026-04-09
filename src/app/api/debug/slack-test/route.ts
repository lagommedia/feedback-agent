import { NextResponse } from 'next/server'
import { readConfig } from '@/lib/storage'

export async function GET() {
  const config = await readConfig()
  const token = config.slack?.botToken
  const channelIds = config.slack?.channelIds ?? []

  if (!token) return NextResponse.json({ error: 'No Slack token configured' }, { status: 400 })

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

  // 1. Test auth
  const authRes = await fetch('https://slack.com/api/auth.test', { headers })
  const auth = await authRes.json()

  // 2. Test each channel individually
  const channelResults = await Promise.all(
    channelIds.map(async (channelId: string) => {
      // Try to get channel info
      const infoRes = await fetch(`https://slack.com/api/conversations.info?channel=${channelId}`, { headers })
      const info = await infoRes.json()

      // Try to get recent messages (last 5)
      const oldest = ((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000).toString()
      const histRes = await fetch(
        `https://slack.com/api/conversations.history?channel=${channelId}&limit=5&oldest=${oldest}`,
        { headers }
      )
      const hist = await histRes.json()

      return {
        channelId,
        name: info.ok ? info.channel?.name : null,
        infoOk: info.ok,
        infoError: info.error ?? null,
        historyOk: hist.ok,
        historyError: hist.error ?? null,
        messageCount: hist.messages?.length ?? 0,
        sampleMessages: (hist.messages ?? []).slice(0, 2).map((m: {ts: string; text: string}) => ({
          ts: new Date(parseFloat(m.ts) * 1000).toISOString().split('T')[0],
          preview: m.text?.slice(0, 80),
        })),
      }
    })
  )

  return NextResponse.json({
    auth: {
      ok: auth.ok,
      error: auth.error ?? null,
      team: auth.team ?? null,
      user: auth.user ?? null,
      botId: auth.bot_id ?? null,
    },
    channels: channelResults,
  })
}
