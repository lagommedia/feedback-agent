import type { FrontRawConversation, FrontRawData, FrontRawMessage } from '@/types'
import type { ChargebeeCustomer } from '@/lib/chargebee'

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

async function fetchWithRetry(url: string, token: string, retries = 4, deadline?: number): Promise<Response> {
  for (let attempt = 0; attempt < retries; attempt++) {
    if (deadline && Date.now() >= deadline) throw new Error('FRONT_DEADLINE_EXCEEDED')
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 30_000) // 30s timeout per request
    try {
      const res = await fetch(url, { headers: headers(token), signal: controller.signal })
      clearTimeout(timer)
      if (res.status === 429) {
        // Cap at 15s — never burn >15s waiting on a rate limit within a time-budgeted sync
        const retryAfter = Math.min(parseInt(res.headers.get('Retry-After') ?? '15'), 15)
        await sleep(retryAfter * 1000)
        continue
      }
      return res
    } catch (err) {
      clearTimeout(timer)
      if (err instanceof Error && err.message === 'FRONT_DEADLINE_EXCEEDED') throw err
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

function emailDomain(email: string): string {
  return email.toLowerCase().split('@')[1] ?? ''
}

function buildChargebeeDomains(customers: ChargebeeCustomer[]): Set<string> {
  const domains = new Set<string>()
  for (const c of customers) {
    if (c.email) {
      const d = emailDomain(c.email)
      // Exclude generic email providers — not useful for B2B matching
      if (d && !['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'aol.com', 'protonmail.com'].includes(d)) {
        domains.add(d)
      }
    }
  }
  return domains
}

function isCustomerConversation(
  convo: FrontRawConversation,
  internalEmails: string[],
  chargebeeDomains?: Set<string>,
): boolean {
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

  // If we have Chargebee domains, require the sender's domain to match a known customer
  if (chargebeeDomains && chargebeeDomains.size > 0) {
    const senderDomain = emailDomain(handle)
    if (senderDomain && !chargebeeDomains.has(senderDomain)) return false
  }

  return true
}

async function fetchConversationPage(
  token: string,
  baseUrl: string,
  since: Date,
  internalEmails: string[],
  chargebeeDomains?: Set<string>,
  deadline?: number,
): Promise<FrontRawConversation[]> {
  const conversations: FrontRawConversation[] = []
  const sinceTs = Math.floor(since.getTime() / 1000)
  const params = new URLSearchParams({ limit: '100', sort_by: 'date', sort_order: 'desc' })
  // q[after] works on the global endpoint; inbox endpoints ignore it, so we
  // also enforce the cutoff manually by stopping when we see older conversations
  params.set('q[after]', sinceTs.toString())

  let url: string | null = `${baseUrl}?${params}`
  let page = 0
  let totalFetched = 0

  while (url) {
    if (deadline && Date.now() >= deadline - 30_000) {
      console.log(`[Front] Approaching deadline, stopping pagination early at page ${page}`)
      break
    }
    page++
    console.log(`[Front] Fetching page ${page} from ${baseUrl} (${totalFetched} total, ${conversations.length} kept so far)...`)
    const res = await fetchWithRetry(url, token, 4, deadline)
    if (!res.ok) throw new Error(`Front conversations API error: ${res.status} ${await res.text()}`)
    const data = await res.json()
    const batch: FrontRawConversation[] = data._results ?? []
    totalFetched += batch.length

    // Results are newest-first — stop as soon as we hit conversations with no activity since `since`
    // Use updated_at (last reply) not created_at (thread opened) so threads started before the
    // window but replied to within it are included
    const withinWindow = batch.filter(c => (c.updated_at ?? c.created_at ?? 0) >= sinceTs)
    const customerBatch = withinWindow.filter(c => isCustomerConversation(c, internalEmails, chargebeeDomains))
    conversations.push(...customerBatch)

    if (withinWindow.length < batch.length) {
      // Hit the date boundary — no need to fetch further pages
      console.log(`[Front] Reached date boundary on page ${page}, stopping.`)
      break
    }

    url = data._pagination?.next ?? null
  }

  console.log(`[Front] Done with ${baseUrl}. ${totalFetched} fetched, ${conversations.length} kept.`)
  return conversations
}

async function fetchAllConversations(
  token: string,
  since?: Date,
  internalEmails: string[] = [],
  excludeInboxIds: string[] = [],
  chargebeeCustomers: ChargebeeCustomer[] = [],
  deadline?: number,
): Promise<FrontRawConversation[]> {
  const sinceDate = since ?? (() => {
    const d = new Date()
    d.setDate(d.getDate() - 1)
    d.setHours(0, 0, 0, 0)
    return d
  })()

  // Build Chargebee domain set for filtering — only conversations from known customer domains
  const chargebeeDomains = chargebeeCustomers.length > 0
    ? buildChargebeeDomains(chargebeeCustomers)
    : undefined

  console.log(`[Front] Chargebee domain filter: ${chargebeeDomains?.size ?? 0} known customer domains`)

  // Always use the global /conversations endpoint — it properly respects q[after]
  const all = await fetchConversationPage(token, `${BASE_URL}/conversations`, sinceDate, internalEmails, chargebeeDomains, deadline)

  // Apply exclude inbox filter (post-filter — skip conversations from excluded inboxes)
  if (excludeInboxIds.length === 0) return all

  const excludeSet = new Set(excludeInboxIds)
  return all.filter(c => {
    const raw = c as unknown as Record<string, unknown>
    const ids: string[] = []
    if (typeof raw.inbox_id === 'string') ids.push(raw.inbox_id)
    const inboxes = raw.inboxes as Array<{ id: string }> | undefined
    if (Array.isArray(inboxes)) inboxes.forEach(i => ids.push(i.id))
    // If no inbox info, include it
    if (ids.length === 0) return true
    // Exclude if any of the conversation's inboxes are in the exclude list
    return !ids.some(id => excludeSet.has(id))
  })
}

async function fetchConversationMessages(
  token: string,
  conversationId: string,
  deadline?: number,
): Promise<FrontRawMessage[]> {
  const messages: FrontRawMessage[] = []
  let url: string | null = `${BASE_URL}/conversations/${conversationId}/messages?limit=100`

  while (url) {
    if (deadline && Date.now() >= deadline - 30_000) return messages
    const res = await fetchWithRetry(url, token, 4, deadline)
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

export async function syncFront(
  token: string,
  since?: Date,
  internalEmails: string[] = [],
  excludeInboxIds: string[] = [],
  limit?: number,  // cap how many conversations get messages fetched (for timeout safety)
  chargebeeCustomers: ChargebeeCustomer[] = [],
  budgetMs?: number,  // total time budget; function returns partial results rather than exceeding it
): Promise<FrontRawData> {
  const deadline = budgetMs ? Date.now() + budgetMs : undefined
  const allConversations = await fetchAllConversations(token, since, internalEmails, excludeInboxIds, chargebeeCustomers, deadline)
  // If a limit is set, take the most recently-updated conversations first
  const conversations = limit ? allConversations.slice(0, limit) : allConversations

  const allMessages: FrontRawMessage[] = []
  const CONCURRENCY = 5

  for (let i = 0; i < conversations.length; i += CONCURRENCY) {
    if (deadline && Date.now() >= deadline - 30_000) {
      console.log(`[Front] Approaching deadline, stopping message fetch at ${i}/${conversations.length} conversations`)
      break
    }
    const batch = conversations.slice(i, i + CONCURRENCY)
    const results = await Promise.all(
      batch.map((c) => fetchConversationMessages(token, c.id, deadline))
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
