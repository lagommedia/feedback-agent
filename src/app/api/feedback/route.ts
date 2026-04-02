import { NextRequest, NextResponse } from 'next/server'
import { readFeedbackStore, writeFeedbackStore } from '@/lib/storage'
import type { FeedbackItem, FeedbackSource, FeedbackType, UrgencyLevel, AppType } from '@/types'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)

    const id = searchParams.get('id')
    const sources = searchParams.getAll('source') as FeedbackSource[]
    const types = searchParams.getAll('type') as FeedbackType[]
    const urgencies = searchParams.getAll('urgency') as UrgencyLevel[]
    const tags = searchParams.getAll('tag')
    const search = searchParams.get('search') ?? ''
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const appType = searchParams.get('appType') as AppType | null
    const assignedTo = searchParams.get('assignedTo')
    const limit = parseInt(searchParams.get('limit') ?? '100')
    const offset = parseInt(searchParams.get('offset') ?? '0')

    const store = await readFeedbackStore()
    let items = store.items

    if (id) {
      items = items.filter((i) => i.id === id)
      return NextResponse.json({ items, total: items.length, lastAnalyzedAt: store.lastAnalyzedAt })
    }

    // App type filter: 'product' includes items with no appType (backward compat)
    if (appType) {
      items = items.filter((i) =>
        appType === 'product'
          ? (!i.appType || i.appType === 'product')
          : i.appType === appType
      )
    }

    if (sources.length > 0) {
      items = items.filter((i) => sources.includes(i.source))
    }
    if (types.length > 0) {
      items = items.filter((i) => types.includes(i.type))
    }
    if (urgencies.length > 0) {
      items = items.filter((i) => urgencies.includes(i.urgency))
    }
    if (tags.length > 0) {
      items = items.filter((i) => (i.tags ?? []).some((t) => tags.includes(t)))
    }
    if (search) {
      const q = search.toLowerCase()
      items = items.filter(
        (i) =>
          i.title.toLowerCase().includes(q) ||
          i.description.toLowerCase().includes(q) ||
          i.customer.toLowerCase().includes(q) ||
          i.rep.toLowerCase().includes(q)
      )
    }
    if (from) {
      items = items.filter((i) => i.date >= from)
    }
    if (to) {
      items = items.filter((i) => i.date <= to)
    }
    if (assignedTo) {
      items = items.filter((i) => i.assignedTo === assignedTo)
    }

    // Sort by date desc
    items.sort((a, b) => b.date.localeCompare(a.date))

    const total = items.length
    const paginated = items.slice(offset, offset + limit)

    return NextResponse.json({
      items: paginated,
      total,
      lastAnalyzedAt: store.lastAnalyzedAt,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { id, type, customer, rep, tags, appType, assignedTo } = await req.json()
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const store = await readFeedbackStore()
    const updated = {
      ...store,
      items: store.items.map((i: FeedbackItem) =>
        i.id === id
          ? {
              ...i,
              ...(type !== undefined && { type: type as FeedbackType }),
              ...(customer !== undefined && { customer }),
              ...(rep !== undefined && { rep }),
              ...(tags !== undefined && { tags }),
              ...(appType !== undefined && { appType: appType as AppType }),
              ...(assignedTo !== undefined && { assignedTo: assignedTo || undefined }),
            }
          : i
      ),
    }
    await writeFeedbackStore(updated)
    const item = updated.items.find((i: FeedbackItem) => i.id === id)
    return NextResponse.json({ item })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const store = await readFeedbackStore()
    const updated = { ...store, items: store.items.filter((i: FeedbackItem) => i.id !== id) }
    await writeFeedbackStore(updated)

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
