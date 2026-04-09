import { NextResponse } from 'next/server'
import { unmarkAnalyzedSources, getUnanalyzedCounts } from '@/lib/storage'
import { Pool } from 'pg'

// Admin endpoint: clears April Front conversations from analyzed_sources
// so they get re-analyzed with their latest messages.
// Only affects conversations that have no existing feedback items (no duplicates).
export async function POST(req: Request) {
  try {
    const sinceParam = new URL(req.url).searchParams.get('since') ?? '2026-04-01'
    const sinceEpoch = Math.floor(new Date(sinceParam).getTime() / 1000)

    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL not set')
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    })

    // Find Front conversation IDs updated since the given date
    const res = await pool.query<{ id: string }>(
      `SELECT id FROM front_conversations WHERE (data->>'updated_at')::float >= $1`,
      [sinceEpoch]
    )
    await pool.end()

    const ids = res.rows.map((r) => r.id)
    const cleared = await unmarkAnalyzedSources(ids)
    const remaining = await getUnanalyzedCounts()

    return NextResponse.json({
      since: sinceParam,
      conversationsFound: ids.length,
      clearedFromAnalyzedSources: cleared,
      remainingToAnalyze: remaining,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
