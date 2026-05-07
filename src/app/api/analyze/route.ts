import { NextResponse } from 'next/server'
import {
  readConfig,
  readSlackRaw,
  appendFeedbackItems,
  writeFeedbackStore,
  getTrainingExamples,
  getUnanalyzedAvomaTranscripts,
  getUnanalyzedFrontConversations,
  getUnanalyzedCounts,
  markSourcesAnalyzed,
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
      await writeFeedbackStore({ lastAnalyzedAt: new Date().toISOString() })
      return NextResponse.json({ newItems: 0, remaining: { avoma: 0, front: 0 } })
    }

    // Keep batches small so each Vercel invocation finishes well inside 300s,
    // even when 529 retries (10s each) add overhead.
    // 25 Avoma + 10 Front = 7 Claude batches × ~12s avg = ~84s baseline.
    const [avomaTranscripts, frontData, slack, trainingExamples] = await Promise.all([
      getUnanalyzedAvomaTranscripts(25),
      getUnanalyzedFrontConversations(10),
      readSlackRaw(),
      getTrainingExamples(),
    ])

    console.log(`[Analyze] Fetched ${avomaTranscripts.length} Avoma transcripts, ${frontData.conversations.length} Front convos to process`)

    const avomaSlice = avomaTranscripts.length > 0
      ? { fetchedAt: new Date().toISOString(), meetings: [], transcripts: avomaTranscripts }
      : null

    const frontSlice = frontData.conversations.length > 0
      ? { fetchedAt: new Date().toISOString(), conversations: frontData.conversations, messages: frontData.messages }
      : null

    if (!avomaSlice && !frontSlice && !slack) {
      await writeFeedbackStore({ lastAnalyzedAt: new Date().toISOString() })
      return NextResponse.json({ newItems: 0, remaining: { avoma: 0, front: 0 } })
    }

    let savedCount = 0

    async function onBatchComplete(batchItems: FeedbackItem[]) {
      await appendFeedbackItems(batchItems)
      savedCount += batchItems.length
      console.log(`[Analyze] Saved batch: ${batchItems.length} items (${savedCount} total so far)`)
    }

    const newItems = await analyzeAllContent(
      config.anthropic.apiKey,
      avomaSlice,
      frontSlice,
      slack,
      [], // DB queries already filtered unanalyzed — no in-memory dedup needed
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
      onBatchComplete,
      async (sourceIds) => {
        await markSourcesAnalyzed(sourceIds)
        console.log(`[Analyze] Marked ${sourceIds.length} sources as analyzed`)
      }
    )

    console.log(`[Analyze] Complete. ${newItems.length} new items extracted, ${savedCount} saved.`)

    // Update lastAnalyzedAt
    await writeFeedbackStore({ lastAnalyzedAt: new Date().toISOString() })

    const stillRemaining = await getUnanalyzedCounts()

    return NextResponse.json({
      newItems: newItems.length,
      fetched: { avoma: avomaTranscripts.length, front: frontData.conversations.length },
      remaining: stillRemaining,
    })
  } catch (err) {
    console.error('[Analyze] Fatal error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
