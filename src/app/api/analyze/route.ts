import { NextResponse } from 'next/server'
import {
  readConfig,
  readSlackRaw,
  appendFeedbackItems,
  writeFeedbackStore,
  readFeedbackStore,
  getTrainingExamples,
  getUnanalyzedAvomaTranscripts,
  getUnanalyzedFrontConversations,
  getUnanalyzedCounts,
} from '@/lib/storage'
import { analyzeAllContent } from '@/lib/anthropic'
import type { FeedbackItem } from '@/types'

export const maxDuration = 300

export async function POST() {
  try {
    const config = await readConfig()
    if (!config.anthropic?.apiKey) {
      return NextResponse.json(
        { error: 'Anthropic AI is not configured. Please add your API key in Integrations.' },
        { status: 400 }
      )
    }

    // Check how much unanalyzed content is remaining
    const remaining = await getUnanalyzedCounts()
    const hasSlack = !!(await readSlackRaw())

    if (remaining.avoma === 0 && remaining.front === 0 && !hasSlack) {
      // Everything is already analyzed — just update the timestamp
      await writeFeedbackStore({ lastAnalyzedAt: new Date().toISOString(), items: [] })
      return NextResponse.json({ newItems: 0, totalItems: 0, remaining: { avoma: 0, front: 0 } })
    }

    // Fetch ONLY unanalyzed items — never loads full history into memory
    const [avomaTranscripts, frontData, slack, trainingExamples] = await Promise.all([
      getUnanalyzedAvomaTranscripts(150),
      getUnanalyzedFrontConversations(75),
      readSlackRaw(),
      getTrainingExamples(),
    ])

    // Build synthetic raw data objects (just the unanalyzed slices)
    const avomaSlice = avomaTranscripts.length > 0
      ? { fetchedAt: new Date().toISOString(), meetings: [], transcripts: avomaTranscripts }
      : null

    const frontSlice = frontData.conversations.length > 0
      ? { fetchedAt: new Date().toISOString(), conversations: frontData.conversations, messages: frontData.messages }
      : null

    if (!avomaSlice && !frontSlice && !slack) {
      await writeFeedbackStore({ lastAnalyzedAt: new Date().toISOString(), items: [] })
      return NextResponse.json({ newItems: 0, totalItems: 0, remaining: { avoma: 0, front: 0 } })
    }

    let savedCount = 0

    async function onBatchComplete(batchItems: FeedbackItem[]) {
      await appendFeedbackItems(batchItems)
      savedCount += batchItems.length
      console.log(`[Analyze] Saved batch: ${batchItems.length} items (${savedCount} total so far)`)
    }

    // Pass existingItems: [] — the DB queries already filtered out analyzed content
    const newItems = await analyzeAllContent(
      config.anthropic.apiKey,
      avomaSlice,
      frontSlice,
      slack,
      [], // already filtered at DB level — no need for in-memory dedup
      {
        avoma: config.avoma?.instructions,
        front: config.front?.instructions,
        slack: config.slack?.instructions,
        general: config.anthropic?.instructions,
        product: config.anthropic?.productInstructions,
        service: config.anthropic?.serviceInstructions,
        churn: config.anthropic?.churnInstructions,
      },
      trainingExamples,
      onBatchComplete
    )

    // Update lastAnalyzedAt
    await writeFeedbackStore({ lastAnalyzedAt: new Date().toISOString(), items: [] })

    // Check how much is still left for the caller to decide if another run is needed
    const stillRemaining = await getUnanalyzedCounts()

    return NextResponse.json({
      newItems: newItems.length,
      remaining: stillRemaining,
    })
  } catch (err) {
    console.error('Analysis error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
