import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { readConfig, getChurnExplanation, cacheChurnExplanation, getCompanyReps } from '@/lib/storage'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

interface ExplainRequest {
  companyName: string
  initialScore: number
  initialReasoning: string
  initialScoredAt: string
  latestScore: number
  latestReasoning: string
  latestScoredAt: string
  delta: number
}

export async function POST(req: Request) {
  try {
    const body: ExplainRequest = await req.json()
    const {
      companyName,
      initialScore,
      initialReasoning,
      initialScoredAt,
      latestScore,
      latestReasoning,
      latestScoredAt,
      delta,
    } = body

    // ── 1. Check DB cache first (ensureSchema runs inside getChurnExplanation) ─
    const cached = await getChurnExplanation(companyName)
    if (cached) {
      return NextResponse.json({ explanation: cached, cached: true })
    }

    // ── 2. Look up reps associated with this company ────────────────────────────
    const reps = await getCompanyReps(companyName)
    const repContext = reps.length > 0
      ? `Zeni rep(s) involved with this account: ${reps.join(', ')}`
      : ''

    // ── 3. Generate with Claude Sonnet ──────────────────────────────────────────
    const config = await readConfig()
    const apiKey = config.anthropic?.apiKey
    if (!apiKey) return NextResponse.json({ error: 'Anthropic API key not configured' }, { status: 400 })

    const client = new Anthropic({ apiKey })
    const absDelta = Math.abs(delta)
    const initialDate = new Date(initialScoredAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    const latestDate  = new Date(latestScoredAt).toLocaleDateString('en-US',  { month: 'long', day: 'numeric', year: 'numeric' })

    const prompt = delta < 0
      ? `You are analyzing why a customer's churn risk score improved at Zeni (a financial operations platform).

Company: ${companyName}
Score change: ${initialScore} → ${latestScore} (improved by ${absDelta} points)
First assessment (${initialDate}): "${initialReasoning}"
Latest assessment (${latestDate}): "${latestReasoning}"
${repContext ? `\n${repContext}` : ''}

Write exactly 1-2 sentences explaining WHY the churn risk improved. Focus on what specifically got better — what issue was resolved or what action helped. If a rep name is available, naturally mention who helped address it. Do NOT describe remaining problems. Start with the positive change.`
      : `You are analyzing why a customer's churn risk score increased at Zeni (a financial operations platform).

Company: ${companyName}
Score change: ${initialScore} → ${latestScore} (worsened by ${absDelta} points)
First assessment (${initialDate}): "${initialReasoning}"
Latest assessment (${latestDate}): "${latestReasoning}"
${repContext ? `\n${repContext}` : ''}

Write exactly 1-2 sentences explaining WHY the churn risk increased. Focus on what specifically deteriorated or what new concern emerged. If a rep name is available, naturally mention who was on the account when the issue surfaced. Do NOT list every concern — just the key driver of the change.`

    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 150,
      messages: [{ role: 'user', content: prompt }],
    })

    const explanation = message.content
      .filter(b => b.type === 'text')
      .map(b => (b as { type: 'text'; text: string }).text)
      .join('')
      .trim()

    // ── 4. Persist to DB so next load is instant ────────────────────────────────
    await cacheChurnExplanation(companyName, explanation)

    return NextResponse.json({ explanation, cached: false })
  } catch (err) {
    console.error('[churn-scores/explain] error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
