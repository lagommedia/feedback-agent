export interface ChargebeeCustomer {
  customerId: string
  companyName: string
  email: string
  mrr: number   // USD dollars
  arr: number   // USD dollars
  status: string
}

const BASE = (site: string) => `https://${site}.chargebee.com/api/v2`

function authHeader(apiKey: string) {
  const encoded = Buffer.from(`${apiKey}:`).toString('base64')
  return { Authorization: `Basic ${encoded}`, Accept: 'application/json' }
}

async function fetchAllPages<T>(
  url: string,
  apiKey: string,
  key: string,
): Promise<T[]> {
  const results: T[] = []
  let nextOffset: string | null = null

  do {
    const pageUrl: string = nextOffset ? `${url}&offset=${encodeURIComponent(nextOffset)}` : url
    const pageRes: Response = await fetch(pageUrl, { headers: authHeader(apiKey) })
    if (!pageRes.ok) {
      const text = await pageRes.text()
      throw new Error(`Chargebee API error ${pageRes.status}: ${text}`)
    }
    const data: { list?: Array<Record<string, unknown>>; next_offset?: string } = await pageRes.json()
    for (const item of data.list ?? []) {
      results.push(item[key] as T)
    }
    nextOffset = data.next_offset ?? null
  } while (nextOffset)

  return results
}

interface ChSubscription {
  customer_id: string
  status: string
  mrr?: number  // cents
}

interface ChCustomer {
  id: string
  company?: string
  first_name?: string
  last_name?: string
  email?: string
}

export async function syncChargebeeCustomers(
  apiKey: string,
  site: string,
): Promise<ChargebeeCustomer[]> {
  const base = BASE(site)

  // Fetch active subscriptions and all customers in parallel
  const [subscriptions, customers] = await Promise.all([
    fetchAllPages<ChSubscription>(
      `${base}/subscriptions?limit=100&status[is]=active`,
      apiKey,
      'subscription',
    ),
    fetchAllPages<ChCustomer>(
      `${base}/customers?limit=100`,
      apiKey,
      'customer',
    ),
  ])

  // Build customer lookup map
  const customerMap = new Map<string, ChCustomer>()
  for (const c of customers) customerMap.set(c.id, c)

  // Aggregate MRR per customer (cents → dollars)
  const mrrMap = new Map<string, number>()
  for (const sub of subscriptions) {
    mrrMap.set(sub.customer_id, (mrrMap.get(sub.customer_id) ?? 0) + (sub.mrr ?? 0))
  }

  // Build result list — only customers with active subscriptions
  const results: ChargebeeCustomer[] = []
  for (const [customerId, mrrCents] of mrrMap.entries()) {
    const c = customerMap.get(customerId)
    if (!c) continue
    const companyName =
      c.company?.trim() ||
      [c.first_name, c.last_name].filter(Boolean).join(' ') ||
      c.email ||
      customerId
    const mrr = mrrCents / 100
    results.push({
      customerId,
      companyName,
      email: c.email ?? '',
      mrr,
      arr: mrr * 12,
      status: 'active',
    })
  }

  // Sort by MRR descending
  return results.sort((a, b) => b.mrr - a.mrr)
}
