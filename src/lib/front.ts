import type { FrontRawConversation, FrontRawData, FrontRawMessage } from '@/types'

const BASE_URL = 'https://api2.frontapp.com'

function headers(token: string) {
  return { Authorization: `Bearer ${token}`, Accept: 'application/json' }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

async function fetchWithRetry(url: string, token: string, retries = 4): Promise<Response> {
  for (let attempt = 0; attempt < retries; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 30_000) // 30s timeout per request
    try {
      const res = await fetch(url, { headers: headers(token), signal: controller.signal })
      clearTimeout(timer)
      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get('Retry-After') ?? '60')
        await sleep(retryAfter * 1000)
        continue
      }
      return res
    } catch (err) {
      clearTimeout(timer)
      if (attempt < retries - 1) {
        await sleep(2000 * (attempt + 1)) // exponential backoff
        continue
      }
      throw err
    }
  }
  throw new Error('Max retries exceeded for Front API')
}

// Internal email domains / senders to exclude
const INTERNAL_DOMAINS = ['zeni.ai', 'usezeni.ai']
const AUTOMATED_SENDER_NAMES = [
  'Front Notifications', 'Auto-Receipt', 'no-reply', 'noreply',
  'notifications', 'donotreply', 'do-not-reply',
]
const AUTOMATED_SUBJECT_PATTERNS = [
  /^report domain:/i,
  /^dmarc/i,
  /^merchant email receipt/i,
  /undeliverable/i,
  /^out of office/i,
  /^automatic reply/i,
  /delivery (failure|notification|status)/i,
]

function isCustomerConversation(convo: FrontRawConversation): boolean {
  const recipient = convo.recipient as Record<string, unknown> | undefined
  const handle = String((recipient?.handle as string) ?? '').toLowerCase()
  const name = String((recipient?.name as string) ?? '').toLowerCase()
  const subject = String(convo.subject ?? '').trim()

  // Exclude internal Zeni-to-Zeni conversations
  if (INTERNAL_DOMAINS.some(d => handle.endsWith(`@${d}`))) return false

  // Exclude automated/system senders
  if (AUTOMATED_SENDER_NAMES.some(n => name.includes(n.toLowerCase()))) return false

  // Exclude automated subjects
  if (AUTOMATED_SUBJECT_PATTERNS.some(p => p.test(subject))) return false

  // Exclude conversations with no real recipient (system events)
  if (!handle || handle === '') return false

  return true
}

async function fetchAllConversations(
  token: string,
  since?: Date
): Promise<FrontRawConversation[]> {
  const conversations: FrontRawConversation[] = []
  const params = new URLSearchParams({ limit: '100', sort_by: 'date', sort_order: 'desc' })

  if (since) {
    params.set('q[after]', Math.floor(since.getTime() / 1000).toString())
  } else {
    const jan1 = new Date('2026-01-01')
    params.set('q[after]', Math.floor(jan1.getTime() / 1000).toString())
  }

  let url: string | null = `${BASE_URL}/conversations?${params}`
  let page = 0
  let totalFetched = 0

  while (url) {
    page++
    console.log(`[Front] Fetching page ${page} (${totalFetched} total, ${conversations.length} customer so far)...`)
    const res = await fetchWithRetry(url, token)
    if (!res.ok) throw new Error(`Front conversations API error: ${res.status} ${await res.text()}`)
    const data = await res.json()
    const batch: FrontRawConversation[] = data._results ?? []
    totalFetched += batch.length

    // Only keep genuine customer conversations
    const customerBatch = batch.filter(isCustomerConversation)
    conversations.push(...customerBatch)

    url = data._pagination?.next ?? null
  }

  console.log(`[Front] Done. ${totalFetched} total fetched, ${conversations.length} customer conversations kept.`)
  return conversations
}

async function fetchConversationMessages(
  token: string,
  conversationId: string
): Promise<FrontRawMessage[]> {
  const messages: FrontRawMessage[] = []
  let url: string | null = `${BASE_URL}/conversations/${conversationId}/messages?limit=100`

  while (url) {
    const res = await fetchWithRetry(url, token)
    if (!res.ok) return messages // skip on error
    const data = await res.json()

    for (const msg of data._results ?? []) {
      messages.push({
        id: msg.id,
        conversationId,
        type: msg.type ?? 'email',
        is_inbound: msg.is_inbound ?? false,
        created_at: msg.created_at ?? 0,
        author: msg.author
          ? {
              email: msg.author.email ?? '',
              first_name: msg.author.first_name ?? '',
              last_name: msg.author.last_name ?? '',
            }
          : undefined,
        body: msg.body ?? '',
        text: msg.text?.trim() || stripHtml(msg.body ?? ''),
      })
    }

    url = data._pagination?.next ?? null
  }

  return messages
}

export async function syncFront(token: string, since?: Date): Promise<FrontRawData> {
  const conversations = await fetchAllConversations(token, since)

  const allMessages: FrontRawMessage[] = []
  const CONCURRENCY = 5

  for (let i = 0; i < conversations.length; i += CONCURRENCY) {
    const batch = conversations.slice(i, i + CONCURRENCY)
    const results = await Promise.all(
      batch.map((c) => fetchConversationMessages(token, c.id))
    )
    for (const msgs of results) {
      allMessages.push(...msgs)
    }
    await sleep(200) // respect rate limits
  }

  return {
    fetchedAt: new Date().toISOString(),
    conversations,
    messages: allMessages,
  }
}
