import { createAnthropic } from '@ai-sdk/anthropic'
import { streamText } from 'ai'
import { readConfig, readFeedbackStore } from '@/lib/storage'
import { buildFeedbackContext } from '@/lib/anthropic'

export const maxDuration = 120

export async function POST(req: Request) {
  try {
    const config = await readConfig()
    if (!config.anthropic?.apiKey) {
      return new Response(
        JSON.stringify({ error: 'Anthropic AI is not configured.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const { messages } = await req.json()
    const anthropic = createAnthropic({ apiKey: config.anthropic.apiKey })

    const feedbackStore = await readFeedbackStore()
    const context = await buildFeedbackContext(feedbackStore.items)

    const systemPrompt = feedbackStore.items.length > 0
      ? `You are a product feedback analyst for Zeni, a financial software company. You have access to structured feedback data extracted from customer calls (Avoma), emails (Front), and internal Slack messages.

Here is the current feedback data (${feedbackStore.items.length} total items):

${context}

Answer questions about this feedback accurately and helpfully. You can:
- Identify trends, patterns, and common issues
- Summarize feedback by source, type, urgency, or customer
- Suggest priorities for the product team
- Highlight notable praises or complaints

Be concise and data-driven. Reference specific customers or examples when relevant.`
      : `You are a product feedback analyst for Zeni. No feedback data has been analyzed yet. Tell the user to go to the Integrations page to connect their tools and sync data first.`

    const result = streamText({
      model: anthropic('claude-sonnet-4-6'),
      system: systemPrompt,
      messages,
    })

    return result.toDataStreamResponse()
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
