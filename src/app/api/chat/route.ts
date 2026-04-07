import { createAnthropic } from '@ai-sdk/anthropic'
import { streamText } from 'ai'
import { readConfig, getRecentFeedbackItems, saveChatMessage, touchChatSession, updateChatSessionTitle } from '@/lib/storage'
import { buildFeedbackContext } from '@/lib/anthropic'
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth'
import { v4 as uuidv4 } from 'uuid'
import type { NextRequest } from 'next/server'

export const maxDuration = 120

export async function POST(req: NextRequest) {
  try {
    const config = await readConfig()
    if (!config.anthropic?.apiKey) {
      return new Response(
        JSON.stringify({ error: 'Anthropic AI is not configured.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const body = await req.json()
    const { messages, sessionId } = body

    const anthropic = createAnthropic({ apiKey: config.anthropic.apiKey })

    const recentItems = await getRecentFeedbackItems(200)
    const context = await buildFeedbackContext(recentItems)

    const systemPrompt = recentItems.length > 0
      ? `You are a product feedback analyst for Zeni, a financial software company. You have access to structured feedback data extracted from customer calls (Avoma), emails (Front), and internal Slack messages.

Here is the current feedback data (most recent 200 items):

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
{"title":"Section title","items":[{"id":"the-item-id","title":"Feedback title","customer":"Customer name","date":"YYYY-MM-DD","urgency":"high","source":"avoma","rawSourceId":"the-raw-source-id"}]}
\`\`\`
IMPORTANT: Always include "id", "source", and "rawSourceId" exactly as they appear in the data for each item — "id" links to the feedback detail page, "source"+"rawSourceId" generate direct links to Avoma, Front, or Slack.

4. Combine formats freely in one response: prose + table + chart + mentions blocks all work together.

5. When asked for feedback "in a table format", use a GFM table. When asked to "show" or "list" specific tickets, use a mentions block. When showing counts or rankings, also include a chart block.

Be concise and data-driven. Reference specific customers or examples when relevant. Today's date context: the most recent data is from 2026-03-27.`
      : `You are a product feedback analyst for Zeni. No feedback data has been analyzed yet. Tell the user to go to the Integrations page to connect their tools and sync data first.`

    // Get the latest user message to save + use for auto-title
    const lastUserMessage = [...messages].reverse().find((m: { role: string }) => m.role === 'user')

    // Save user message to DB (fire-and-forget, don't block streaming)
    if (sessionId && lastUserMessage) {
      saveChatMessage(uuidv4(), sessionId, 'user', lastUserMessage.content).catch(console.error)
      touchChatSession(sessionId).catch(console.error)

      // Auto-title the session after the first user message (title is still "New Chat")
      if (messages.filter((m: { role: string }) => m.role === 'user').length === 1) {
        const title = lastUserMessage.content.slice(0, 60) + (lastUserMessage.content.length > 60 ? '…' : '')
        updateChatSessionTitle(sessionId, title).catch(console.error)
      }
    }

    const result = streamText({
      model: anthropic('claude-sonnet-4-6'),
      system: systemPrompt,
      messages,
      onFinish: async ({ text }) => {
        if (sessionId && text) {
          await saveChatMessage(uuidv4(), sessionId, 'assistant', text).catch(console.error)
          await touchChatSession(sessionId).catch(console.error)
        }
      },
    })

    return result.toDataStreamResponse()
  } catch (err) {
    // Return the error through the AI data stream so useChat surfaces the real message
    const message = err instanceof Error ? err.message : String(err)
    const encoded = new TextEncoder().encode(`3:${JSON.stringify(message)}\n`)
    return new Response(encoded, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    })
  }
}
