import { NextRequest, NextResponse } from 'next/server'
import { readConfig, readFeedbackStore } from '@/lib/storage'
import { generateReport } from '@/lib/anthropic'
import type { ReportRequest } from '@/types'

export const maxDuration = 300

export async function POST(req: NextRequest) {
  try {
    const config = await readConfig()
    if (!config.anthropic?.apiKey) {
      return NextResponse.json(
        { error: 'Anthropic AI is not configured.' },
        { status: 400 }
      )
    }

    const body = (await req.json()) as ReportRequest
    const store = await readFeedbackStore()

    if (store.items.length === 0) {
      return NextResponse.json(
        { error: 'No feedback data available. Please sync integrations and run analysis first.' },
        { status: 400 }
      )
    }

    const stream = await generateReport(config.anthropic.apiKey, store.items, body)

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked',
        'Cache-Control': 'no-cache',
      },
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
