export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { requeueUnproductiveMeetings, getUnanalyzedCounts } from '@/lib/storage'

/**
 * Re-queues large Avoma meetings (50+ segments, April 2026 onward) that were
 * marked as analyzed but produced zero feedback items. These are almost certainly
 * victims of JSON parse failures in earlier analysis runs.
 */
export async function POST() {
  try {
    const requeued = await requeueUnproductiveMeetings(50, '2026-04-01')
    const remaining = await getUnanalyzedCounts()
    return NextResponse.json({ requeued, remaining })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
