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

Answer questions about this feedback accurately and helpfully.

FORMATTING RULES — always follow these:

1. Use GFM markdown tables for any structured comparison data.

2. For bar charts / ranked lists with counts, output a fenced code block tagged "chart":
\`\`\`chart
{"title":"Chart title here","data":[{"label":"Label A","value":12},{"label":"Label B","value":8}]}
\`\`\`

3. For lists of specific feedback items (e.g. "show me the tickets"), output a fenced code block tagged "mentions":
\`\`\`mentions
{"title":"Section title","items":[{"title":"Feedback title","customer":"Customer name","date":"YYYY-MM-DD","urgency":"high","source":"avoma","rawSourceId":"the-raw-source-id"}]}
\`\`\`
IMPORTANT: Always include "source" and "rawSourceId" exactly as they appear in the data for each item — these are used to generate direct links to Avoma, Front, or Slack.

4. Combine formats freely in one response: prose + table + chart + mentions blocks all work together.

5. When asked for feedback "in a table format", use a GFM table. When asked to "show" or "list" specific tickets, use a mentions block. When showing counts or rankings, also include a chart block.

Be concise and data-driven. Reference specific customers or examples when relevant. Today's date context: the most recent data is from 2026-03-27.`
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
