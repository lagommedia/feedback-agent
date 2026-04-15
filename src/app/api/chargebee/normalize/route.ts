import { NextResponse } from 'next/server'
import { getChargebeeCustomers, getDistinctCustomers, readFeedbackStore, writeFeedbackStore } from '@/lib/storage'
import { bestChargebeeMatch } from '@/lib/name-match'
import type { FeedbackItem } from '@/types'

export const maxDuration = 300

export async function POST() {
  try {
    const [cbCustomers, feedbackCustomers, store] = await Promise.all([
      getChargebeeCustomers(),
      getDistinctCustomers(),
      readFeedbackStore(),
    ])

    if (cbCustomers.length === 0) {
      return NextResponse.json({ error: 'No Chargebee customers synced yet' }, { status: 400 })
    }

    const cbNames = cbCustomers.map((c) => c.companyName)

    // Build a rename map: feedbackName → chargebeeName
    const renameMap = new Map<string, string>()
    for (const name of feedbackCustomers) {
      const match = bestChargebeeMatch(name, cbNames)
      if (match && match !== name) {
        renameMap.set(name, match)
      }
    }

    if (renameMap.size === 0) {
      return NextResponse.json({ updated: 0, message: 'All names already match Chargebee' })
    }

    // Apply renames to feedback items
    let updated = 0
    const updatedItems: FeedbackItem[] = store.items.map((item) => {
      const canonical = renameMap.get(item.customer)
      if (!canonical) return item
      updated++
      return { ...item, customer: canonical }
    })

    await writeFeedbackStore({ ...store, items: updatedItems })

    const changes = [...renameMap.entries()].map(([from, to]) => ({ from, to }))
    return NextResponse.json({ updated, changes })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
