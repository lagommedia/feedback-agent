import type { SlackRawData, SlackRawMessage } from '@/types'

const BASE_URL = 'https://slack.com/api'

function headers(token: string) {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function fetchChannels(
  token: string
): Promise<Array<{ id: string; name: string }>> {
  const channels: Array<{ id: string; name: string }> = []
  let cursor: string | undefined

  do {
    const params = new URLSearchParams({
      limit: '200',
      types: 'public_channel,private_channel',
      exclude_archived: 'true',
      ...(cursor ? { cursor } : {}),
    })

    const res = await fetch(`${BASE_URL}/conversations.list?${params}`, {
      headers: headers(token),
    })
    const data = await res.json()
    if (!data.ok) throw new Error(`Slack error: ${data.error}`)

    for (const ch of data.channels ?? []) {
      channels.push({ id: ch.id, name: ch.name })
    }

    cursor = data.response_metadata?.next_cursor || undefined
  } while (cursor)

  return channels
}

async function resolveUserNames(
  token: string,
  userIds: string[]
): Promise<Record<string, string>> {
  const names: Record<string, string> = {}

  for (const userId of userIds) {
    if (userId.startsWith('B') || userId === 'USLACKBOT') continue // skip bots
    try {
      const res = await fetch(`${BASE_URL}/users.info?user=${userId}`, {
        headers: headers(token),
      })
      const data = await res.json()
      if (data.ok) {
        names[userId] =
          data.user?.profile?.display_name ||
          data.user?.real_name ||
          data.user?.name ||
          userId
      }
    } catch {
      names[userId] = userId
    }
    await sleep(100) // rate limit protection
  }

  return names
}

async function fetchChannelHistory(
  token: string,
  channelId: string,
  oldest?: string
): Promise<Array<{ ts: string; user: string; text: string }>> {
  const messages: Array<{ ts: string; user: string; text: string }> = []
  let cursor: string | undefined

  do {
    const params = new URLSearchParams({
      channel: channelId,
      limit: '1000',
      ...(oldest ? { oldest } : {}),
      ...(cursor ? { cursor } : {}),
    })

    const res = await fetch(`${BASE_URL}/conversations.history?${params}`, {
      headers: headers(token),
    })
    const data = await res.json()

    if (!data.ok) {
      if (data.error === 'ratelimited') {
        await sleep(60000)
        continue
      }
      throw new Error(`Slack error: ${data.error}`)
    }

    for (const msg of data.messages ?? []) {
      if (msg.subtype) continue // skip system messages
      if (!msg.text) continue
      messages.push({ ts: msg.ts, user: msg.user ?? 'unknown', text: msg.text })
    }

    cursor = data.response_metadata?.next_cursor || undefined
  } while (cursor)

  return messages
}

export async function syncSlack(
  token: string,
  channelIds: string[],
  since?: Date
): Promise<SlackRawData> {
  // Fetch available channels to get names
  let allChannels: Array<{ id: string; name: string }> = []
  try {
    allChannels = await fetchChannels(token)
  } catch {
    // If we can't list channels, use what we have from config
    allChannels = channelIds.map((id) => ({ id, name: id }))
  }

  const channelMap = new Map(allChannels.map((c) => [c.id, c.name]))

  // Filter to only configured channel IDs
  const targetChannels = channelIds.map((id) => ({
    id,
    name: channelMap.get(id) ?? id,
  }))

  const oldest = since
    ? (since.getTime() / 1000).toString()
    : ((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000).toString()

  const rawMessages: SlackRawMessage[] = []

  for (const channel of targetChannels) {
    try {
      const msgs = await fetchChannelHistory(token, channel.id, oldest)
      for (const msg of msgs) {
        rawMessages.push({
          ts: msg.ts,
          user: msg.user,
          text: msg.text,
          channel: channel.id,
          channelName: channel.name,
        })
      }
    } catch (err) {
      console.error(`Failed to fetch channel ${channel.id}:`, err)
    }
    await sleep(500)
  }

  // Resolve user names
  const uniqueUserIds = [...new Set(rawMessages.map((m) => m.user))]
  const userNames = await resolveUserNames(token, uniqueUserIds)

  for (const msg of rawMessages) {
    msg.username = userNames[msg.user] ?? msg.user
  }

  return {
    fetchedAt: new Date().toISOString(),
    channels: targetChannels,
    messages: rawMessages,
  }
}
