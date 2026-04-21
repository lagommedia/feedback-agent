import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { readConfig, readFeedbackStore, upsertChurnScores } from '@/lib/storage'
import type { ChurnScore } from '@/lib/storage'

export const maxDuration = 300

export async function POST() {
  try {
    const config = await readConfig()
    const apiKey = config.anthropic?.apiKey
    if (!apiKey) return NextResponse.json({ error: 'Anthropic API key not configured' }, { status: 400 })

    const scoringInstructions = config.churnRiskScore?.instructions?.trim()
    if (!scoringInstructions) return NextResponse.json({ error: 'Churn Risk Score instructions not configured on the Integrations page' }, { status: 400 })

    const { items } = await readFeedbackStore()
    if (items.length === 0) return NextResponse.json({ scored: 0 })

    // Group items by company
    const byCompany = new Map<string, typeof items>()
    for (const item of items) {
      const key = item.customer || 'Unknown'
      if (key === 'Unknown') continue
      if (!byCompany.has(key)) byCompany.set(key, [])
      byCompany.get(key)!.push(item)
    }

    const client = new Anthropic({ apiKey })

    // 20 companies per Claude call — balances token usage vs number of calls
    const companies = [...byCompany.entries()]
    const BATCH = 20

    const systemPrompt = `You compute churn risk scores for customers based on their feedback.

Scoring instructions:
${scoringInstructions}

For each company provided, return a JSON array where each element is:
{
  "company": string,
  "score": number (0-100, where 0 = no risk, 100 = certain churn),
  "confidence": "high" | "medium" | "low",
  "reasoning": string (1-2 sentences max)
}

Confidence guide:
- "high": 5+ feedback items with clear, consistent signals
- "medium": 2-4 items or mixed signals
- "low": 1 item or very limited data

Return ONLY a valid JSON array. No markdown, no explanation.`

    // Build all batch requests
    const batches: Array<[string, typeof items][]> = []
    for (let i = 0; i < companies.length; i += BATCH) {
      batches.push(companies.slice(i, i + BATCH))
    }

    // Run all batches in parallel — cuts total time from N*T to ~T regardless of company count
    const batchResults = await Promise.allSettled(
      batches.map(async (batch, idx) => {
        const userContent = batch.map(([company, companyItems]) => {
          const summary = companyItems.slice(0, 20).map(it =>
            `- [${it.type}] [${it.urgency}] [${it.appType}] ${it.title}: ${it.description.slice(0, 150)}`
          ).join('\n')
          return `Company: ${company}\nFeedback (${companyItems.length} items):\n${summary}`
        }).join('\n\n---\n\n')

        const response = await client.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 4096,
          system: systemPrompt,
          messages: [{ role: 'user', content: userContent }],
        })

        const text = response.content[0].type === 'text' ? response.content[0].text : '[]'
        const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
        const parsed = JSON.parse(cleaned)
        const scored: ChurnScore[] = []

        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (item.company && typeof item.score === 'number') {
              scored.push({
                companyName: item.company,
                score: Math.min(100, Math.max(0, Math.round(item.score))),
                confidence: ['high', 'medium', 'low'].includes(item.confidence) ? item.confidence : 'low',
                reasoning: String(item.reasoning ?? ''),
                scoredAt: new Date().toISOString(),
              })
            }
          }
        }
        return scored
      })
    )

    const results: ChurnScore[] = []
    batchResults.forEach((r, idx) => {
      if (r.status === 'fulfilled') {
        results.push(...r.value)
      } else {
        console.error(`[churn-scores] Batch ${idx + 1} failed:`, r.reason)
      }
    })

    await upsertChurnScores(results)
    return NextResponse.json({ scored: results.length })
  } catch (err) {
    console.error('[churn-scores] compute error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
