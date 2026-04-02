import Anthropic from '@anthropic-ai/sdk'
import { v4 as uuidv4 } from 'uuid'
import type {
  AvomaRawData,
  AvomaRawTranscript,
  FeedbackItem,
  FeedbackSource,
  FeedbackType,
  FrontRawConversation,
  FrontRawData,
  FrontRawMessage,
  ReportRequest,
  SlackRawData,
  UrgencyLevel,
} from '@/types'

function buildSystemPrompt(categoryInstructions?: {
  general?: string
  product?: string
  service?: string
  churn?: string
}, trainingExamples?: import('@/lib/storage').TrainingExample[]): string {
  const productGuide = categoryInstructions?.product
    ? `\n  Custom guidance: ${categoryInstructions.product}`
    : '\n  Default: software features, UI/UX, bugs, product functionality requests'
  const serviceGuide = categoryInstructions?.service
    ? `\n  Custom guidance: ${categoryInstructions.service}`
    : '\n  Default: quality of support, onboarding, response times, rep interactions'
  const churnGuide = categoryInstructions?.churn
    ? `\n  Custom guidance: ${categoryInstructions.churn}`
    : '\n  Default: frustration severe enough to cancel, competitor mentions, explicit intent to leave'

  const globalSection = categoryInstructions?.general
    ? `\n\nGlobal instructions (apply universally to all analysis):\n${categoryInstructions.general}\n`
    : ''

  return `You are an AI assistant that extracts structured feedback from customer interactions at Zeni, a financial software company.${globalSection}

Analyze the provided content and extract feedback items about Zeni's product or service.

For each feedback item found, return a JSON object. Focus on:
- Issues: bugs, frustrations, complaints, errors, things not working
- Praises: positive feedback, compliments, things working well
- Feature requests: requests for new functionality or improvements

Return ONLY a valid JSON array (no markdown, no explanation). Each object must have exactly these fields:
{
  "type": "issue" | "praise" | "feature_request",
  "appType": "product" | "service" | "churn_risk",
  "title": string (max 80 chars, descriptive),
  "description": string (full context from the source),
  "urgency": "low" | "medium" | "high",
  "customer": string (customer company or person name, or "Unknown"),
  "rep": string (Zeni employee/rep name, or "Unknown"),
  "date": string (ISO date of the content, e.g. "2024-01-15"),
  "rawSourceId": string (the ID provided in the input),
  "tags": array of 1-3 strings — chosen from the tag list that matches the appType (see below)
}

appType classification guidance:
- "product": ${productGuide}
- "service": ${serviceGuide}
- "churn_risk": ${churnGuide}
  Note: churn_risk takes priority — if something fits both product/service AND signals churn risk, use "churn_risk"

Tag lists by appType — ONLY use tags from the matching list:

If appType is "product", choose from:
- Dashboard: general UI, transactions, categorization, analytics, account overview
- Reports: reporting features, exports, financial statements, tax documents
- Bill Pay: invoices, AP, vendor payments, bill management
- Reimbursements: expense approvals, employee reimbursements, receipt management
- Checking / Debit: bank accounts, bank feeds, debit card transactions
- Credit Cards: credit card feeds, corporate cards, card management
- Treasury: cash management, runway, burn rate, investments
- Integrations: third-party app connections (QuickBooks, Gusto, Plaid, etc.)
- AI CFO: AI-powered financial insights, automated bookkeeping intelligence, smart recommendations

If appType is "service", choose from:
- Onboarding: initial setup, kickoff, getting started experience
- Account Management: dedicated rep quality, relationship, responsiveness
- Bookkeeping Accuracy: errors, miscategorizations, reconciliation issues
- Month-End Close: timeliness and quality of monthly close process
- Tax Preparation: tax filing support, accuracy, deadlines
- Response Time: how quickly support or reps reply
- Communication: clarity, proactiveness, keeping customers informed
- Escalation Handling: how issues get escalated and resolved
- Training & Enablement: guidance on how to use Zeni effectively
- Billing & Invoicing: billing disputes, invoice questions, payment issues

If appType is "churn_risk", choose from:
- Pricing / Cost: too expensive, ROI concerns, cost vs. value
- Missing Features: can't do something they need in the product
- Competitor Mention: explicitly names a competitor (Pilot, Bench, Puzzle, etc.)
- Bookkeeping Errors: serious mistakes that erode trust
- Slow Response: frustration with delays from the Zeni team
- Lack of Value: not seeing enough benefit to justify staying
- Leadership / Team Change: new finance leader reconsidering the vendor
- Contract / Renewal Risk: hesitation at renewal, downgrade requests
- Support Dissatisfaction: repeated bad support experiences
- Switching Intent: direct signals they are considering leaving Zeni

If no relevant feedback is found, return [].${
  trainingExamples && trainingExamples.length > 0
    ? `\n\nHuman-curated classification corrections (the Zeni team has reviewed past AI classifications and corrected them — apply these learnings when classifying similar content):\n\n${
        trainingExamples
          .slice(0, 50)
          .map((ex, i) => {
            const correction =
              ex.correctAppType === null
                ? 'REMOVE — should not be extracted as feedback at all'
                : `RECLASSIFY as "${ex.correctAppType}" (was "${ex.originalAppType}")`
            return `[${i + 1}] Title: "${ex.feedbackTitle}"\n    Content: "${ex.feedbackDescription.slice(0, 200)}..."\n    Correction: ${correction}\n    Reason: "${ex.notes}"`
          })
          .join('\n\n')
      }`
    : ''
}`
}

interface RawContentItem {
  id: string
  source: FeedbackSource
  date: string
  content: string
  instructions?: string
}

function transcriptToContent(t: AvomaRawTranscript): RawContentItem {
  const text = t.segments.map((s) => `${s.speaker}: ${s.text}`).join('\n')
  const attendeeList = t.attendees.map((a) => a.name).join(', ')
  return {
    id: t.meetingUuid,
    source: 'avoma',
    date: t.date ? t.date.split('T')[0] : new Date().toISOString().split('T')[0],
    content: `Meeting: ${t.meetingTitle}\nAttendees: ${attendeeList}\n\nTranscript:\n${text}`,
  }
}

function conversationToContent(
  conv: FrontRawConversation,
  messages: FrontRawMessage[]
): RawContentItem {
  const convMessages = messages.filter((m) => m.conversationId === conv.id)
  const text = convMessages
    .sort((a, b) => a.created_at - b.created_at)
    .map((m) => {
      const author = m.author
        ? `${m.author.first_name} ${m.author.last_name}`.trim()
        : m.is_inbound
          ? 'Customer'
          : 'Zeni Rep'
      return `${author}: ${m.text || m.body}`
    })
    .join('\n\n')

  return {
    id: conv.id,
    source: 'front',
    date: new Date(conv.created_at * 1000).toISOString().split('T')[0],
    content: `Email Subject: ${conv.subject}\n\nMessages:\n${text}`,
  }
}

function slackMessagesToContent(
  messages: SlackRawData['messages'],
  channelName: string,
  channelId: string
): RawContentItem {
  const text = messages
    .sort((a, b) => parseFloat(a.ts) - parseFloat(b.ts))
    .map((m) => `${m.username ?? m.user}: ${m.text}`)
    .join('\n')

  const firstTs = messages[0]?.ts ?? '0'
  return {
    id: `slack-${channelId}-${firstTs}`,
    source: 'slack',
    date: new Date(parseFloat(firstTs) * 1000).toISOString().split('T')[0],
    content: `Slack Channel: #${channelName}\n\nMessages:\n${text}`,
  }
}

async function analyzeChunk(
  client: Anthropic,
  items: RawContentItem[],
  systemPrompt: string
): Promise<FeedbackItem[]> {
  const userContent = items
    .map((item, i) => {
      const header = `--- Item ${i + 1} (ID: ${item.id}, Source: ${item.source}, Date: ${item.date}) ---`
      const instructions = item.instructions ? `[Instructions for this source: ${item.instructions}]` : ''
      return [header, instructions, item.content].filter(Boolean).join('\n')
    })
    .join('\n\n')

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: 'user', content: userContent }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : '[]'

  try {
    // Strip any accidental markdown code fences
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const parsed = JSON.parse(cleaned)
    if (!Array.isArray(parsed)) return []

    return parsed.map((item) => ({
      id: uuidv4(),
      source: items.find((i) => i.id === item.rawSourceId)?.source ?? 'avoma',
      type: (item.type as FeedbackType) ?? 'issue',
      appType: (['product', 'service', 'churn_risk'].includes(item.appType) ? item.appType : 'product') as import('@/types').AppType,
      title: String(item.title ?? '').slice(0, 80),
      description: String(item.description ?? ''),
      urgency: (item.urgency as UrgencyLevel) ?? 'medium',
      customer: String(item.customer ?? 'Unknown'),
      rep: String(item.rep ?? 'Unknown'),
      date: String(item.date ?? new Date().toISOString().split('T')[0]),
      tags: Array.isArray(item.tags) ? item.tags.map(String) : [],
      rawSourceId: String(item.rawSourceId ?? ''),
      analyzedAt: new Date().toISOString(),
    }))
  } catch {
    return []
  }
}

export async function analyzeAllContent(
  apiKey: string,
  avoma: AvomaRawData | null,
  front: FrontRawData | null,
  slack: SlackRawData | null,
  existingItems: FeedbackItem[],
  instructions?: { avoma?: string; front?: string; slack?: string; general?: string; product?: string; service?: string; churn?: string },
  trainingExamples?: import('@/lib/storage').TrainingExample[]
): Promise<FeedbackItem[]> {
  const client = new Anthropic({ apiKey })
  const systemPrompt = buildSystemPrompt({
    general: instructions?.general,
    product: instructions?.product,
    service: instructions?.service,
    churn: instructions?.churn,
  }, trainingExamples)
  const analyzedIds = new Set(existingItems.map((i) => i.rawSourceId))

  const allItems: RawContentItem[] = []

  // Avoma transcripts
  if (avoma) {
    for (const transcript of avoma.transcripts) {
      if (!analyzedIds.has(transcript.meetingUuid)) {
        const item = transcriptToContent(transcript)
        if (instructions?.avoma) item.instructions = instructions.avoma
        else if (instructions?.general) item.instructions = instructions.general
        allItems.push(item)
      }
    }
  }

  // Front conversations
  if (front) {
    for (const conv of front.conversations) {
      if (!analyzedIds.has(conv.id)) {
        const item = conversationToContent(conv, front.messages)
        if (instructions?.front) item.instructions = instructions.front
        else if (instructions?.general) item.instructions = instructions.general
        allItems.push(item)
      }
    }
  }

  // Slack messages — group by channel
  if (slack) {
    const byChannel = new Map<string, typeof slack.messages>()
    for (const msg of slack.messages) {
      const existing = byChannel.get(msg.channel) ?? []
      existing.push(msg)
      byChannel.set(msg.channel, existing)
    }

    for (const [channelId, messages] of byChannel) {
      const channelName = messages[0]?.channelName ?? channelId
      for (let i = 0; i < messages.length; i += 100) {
        const batch = messages.slice(i, i + 100)
        const item = slackMessagesToContent(batch, channelName, channelId)
        if (!analyzedIds.has(item.id)) {
          if (instructions?.slack) item.instructions = instructions.slack
          else if (instructions?.general) item.instructions = instructions.general
          allItems.push(item)
        }
      }
    }
  }

  if (allItems.length === 0) return []

  const newFeedbackItems: FeedbackItem[] = []

  // Process in batches: 10 Avoma, 20 Front, handle Slack inline
  const BATCH_SIZE = 15
  for (let i = 0; i < allItems.length; i += BATCH_SIZE) {
    const batch = allItems.slice(i, i + BATCH_SIZE)
    const results = await analyzeChunk(client, batch, systemPrompt)
    newFeedbackItems.push(...results)
  }

  return newFeedbackItems
}

export async function buildFeedbackContext(items: FeedbackItem[]): Promise<string> {
  const summary = items.slice(0, 200).map((item) => ({
    id: item.id,
    source: item.source,
    rawSourceId: item.rawSourceId,
    type: item.type,
    appType: item.appType,
    title: item.title,
    description: item.description.slice(0, 200),
    urgency: item.urgency,
    customer: item.customer,
    rep: item.rep,
    date: item.date,
  }))
  return JSON.stringify(summary)
}

export async function generateReport(
  apiKey: string,
  items: FeedbackItem[],
  request: ReportRequest
): Promise<ReadableStream<Uint8Array>> {
  const client = new Anthropic({ apiKey })

  let filteredItems = items
  if (request.dateRange) {
    const from = new Date(request.dateRange.from)
    const to = new Date(request.dateRange.to)
    filteredItems = items.filter((item) => {
      const d = new Date(item.date)
      return d >= from && d <= to
    })
  }

  const context = JSON.stringify(filteredItems.map((item) => ({
    source: item.source,
    type: item.type,
    appType: item.appType,
    title: item.title,
    description: item.description.slice(0, 300),
    urgency: item.urgency,
    customer: item.customer,
    rep: item.rep,
    date: item.date,
    tags: item.tags,
  })))

  const reportPrompts: Record<ReportRequest['type'], string> = {
    weekly_summary: `Generate a comprehensive weekly product feedback summary. Include:
1. Executive summary (2-3 sentences)
2. Key issues found (grouped by urgency)
3. Customer praises and wins
4. Feature requests from customers
5. Recommended action items for the product team
Format as clean markdown with headers.`,
    issues_deep_dive: `Perform a deep dive analysis of all issues in the feedback data. Include:
1. Critical issues (high urgency) with full context
2. Medium urgency issues grouped by theme
3. Patterns and recurring complaints
4. Affected customers and Zeni reps
5. Recommended fixes/prioritization
Format as clean markdown.`,
    praises: `Summarize all positive feedback and praises. Include:
1. What customers love most about Zeni
2. Features receiving the most praise
3. Zeni reps receiving positive mentions
4. Key differentiators worth highlighting
Format as clean markdown.`,
    feature_requests: `Analyze all feature requests. Include:
1. Most requested features (by frequency)
2. Customer context for each request
3. Business impact assessment
4. Suggested prioritization
Format as clean markdown.`,
    custom: request.customPrompt ?? 'Analyze the feedback data and provide insights.',
  }

  const stream = await client.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: `You are a product analytics expert for Zeni. Analyze the provided product feedback data and generate a report.

Feedback data:
${context}`,
    messages: [{ role: 'user', content: reportPrompts[request.type] }],
  })

  const encoder = new TextEncoder()
  return new ReadableStream({
    async start(controller) {
      for await (const chunk of stream) {
        if (
          chunk.type === 'content_block_delta' &&
          chunk.delta.type === 'text_delta'
        ) {
          controller.enqueue(encoder.encode(chunk.delta.text))
        }
      }
      controller.close()
    },
  })
}
