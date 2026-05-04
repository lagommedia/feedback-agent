import { NextResponse } from 'next/server'
import { getChurnScoreDeltas } from '@/lib/storage'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const deltas = await getChurnScoreDeltas()
    return NextResponse.json({ deltas })
  } catch (err) {
    console.error('[churn-scores/history] error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
