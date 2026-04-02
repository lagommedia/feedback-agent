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
  'notifications', 'donotreply', 'do-not-reply', 'mailer-daemon',
  'postmaster', 'bounce', 'support@', 'hello@', 'info@', 'team@',
]
const AUTOMATED_SUBJECT_PATTERNS = [
  /^report domain:/i,
  /^dmarc/i,
  /^merchant email receipt/i,
  /undeliverable/i,
  /^out of office/i,
  /^automatic reply/i,
  /delivery (failure|notification|status)/i,
  /^invoice #/i,
  /^receipt for/i,
  /^your (order|payment|subscription|account)/i,
  /^(payment|invoice|receipt) (received|confirmed|due|reminder)/i,
  /^verify your email/i,
  /^confirm your/i,
  /^welcome to/i,
  /^you have been (added|invited)/i,
  /^\[?notification\]?:/i,
  /^security alert/i,
  /^action required:/i,
  /newsletter/i,
  /^unsubscribe/i,
]

function isCustomerConversation(convo: FrontRawConversation, internalEmails: string[]): boolean {
  const recipient = convo.recipient as Record<string, unknown> | undefined
  const handle = String((recipient?.handle as string) ?? '').toLowerCase()
  const name = String((recipient?.name as string) ?? '').toLowerCase()
  const subject = String(convo.subject ?? '').trim()

  // Exclude internal Zeni-to-Zeni conversations
  if (INTERNAL_DOMAINS.some(d => handle.endsWith(`@${d}`))) return false

  // Exclude conversations with internal rep email addresses
  if (internalEmails.some(e => handle === e.toLowerCase())) return false

  // Exclude automated/system senders
  if (AUTOMATED_SENDER_NAMES.some(n => name.includes(n.toLowerCase()))) return false

  // Exclude automated subjects
  if (AUTOMATED_SUBJECT_PATTERNS.some(p => p.test(subject))) return false

  // Exclude conversations with no real recipient (system events)
  if (!handle || handle === '') return false

  return true
}

async function fetchConversationPage(
  token: string,
  baseUrl: string,
  since: Date,
  internalEmails: string[]
): Promise<FrontRawConversation[]> {
  const conversations: FrontRawConversation[] = []
  const params = new URLSearchParams({ limit: '100', sort_by: 'date', sort_order: 'desc' })
  params.set('q[after]', Math.floor(since.getTime() / 1000).toString())

  let url: string | null = `${baseUrl}?${params}`
  let page = 0
  let totalFetched = 0

  while (url) {
    page++
    console.log(`[Front] Fetching page ${page} from ${baseUrl} (${totalFetched} total, ${conversations.length} kept so far)...`)
    const res = await fetchWithRetry(url, token)
    if (!res.ok) throw new Error(`Front conversations API error: ${res.status} ${await res.text()}`)
    const data = await res.json()
    const batch: FrontRawConversation[] = data._results ?? []
    totalFetched += batch.length

    const customerBatch = batch.filter(c => isCustomerConversation(c, internalEmails))
    conversations.push(...customerBatch)

    url = data._pagination?.next ?? null
  }

  console.log(`[Front] Done with ${baseUrl}. ${totalFetched} fetched, ${conversations.length} kept.`)
  return conversations
}

async function fetchAllConversations(
  token: string,
  since?: Date,
  internalEmails: string[] = [],
  inboxIds: string[] = []
): Promise<FrontRawConversation[]> {
  const sinceDate = since ?? (() => {
    const d = new Date()
    d.setDate(d.getDate() - 1)
    d.setHours(0, 0, 0, 0)
    return d
  })()

  if (inboxIds.length > 0) {
    // Fetch only from specified inboxes — much more targeted
    const results = await Promise.all(
      inboxIds.map(id =>
        fetchConversationPage(token, `${BASE_URL}/inboxes/${id}/conversations`, sinceDate, internalEmails)
      )
    )
    const all = results.flat()
    // Deduplicate by conversation ID (same convo can appear in multiple inboxes)
    const seen = new Set<string>()
    return all.filter(c => seen.has(c.id) ? false : (seen.add(c.id), true))
  }

  // Fallback: fetch all conversations (no inbox filter configured)
  return fetchConversationPage(token, `${BASE_URL}/conversations`, sinceDate, internalEmails)
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

export async function syncFront(token: string, since?: Date, internalEmails: string[] = [], inboxIds: string[] = []): Promise<FrontRawData> {
  const conversations = await fetchAllConversations(token, since, internalEmails, inboxIds)

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
