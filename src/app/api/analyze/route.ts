import { NextResponse } from 'next/server'
import {
  readAvomaRaw,
  readConfig,
  readFeedbackStore,
  readFrontRaw,
  readSlackRaw,
  appendFeedbackItems,
  writeFeedbackStore,
  getTrainingExamples,
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

    const [avoma, front, slack, feedbackStore, trainingExamples] = await Promise.all([
      readAvomaRaw(),
      readFrontRaw(),
      readSlackRaw(),
      readFeedbackStore(),
      getTrainingExamples(),
    ])

    if (!avoma && !front && !slack) {
      return NextResponse.json(
        { error: 'No data to analyze. Please sync at least one integration first.' },
        { status: 400 }
      )
    }

    let savedCount = 0

    // Save each batch immediately as it completes — no work is lost if the run times out
    async function onBatchComplete(batchItems: FeedbackItem[]) {
      await appendFeedbackItems(batchItems)
      savedCount += batchItems.length
      console.log(`[Analyze] Saved batch: ${batchItems.length} items (${savedCount} total so far)`)
    }

    const newItems = await analyzeAllContent(
      config.anthropic.apiKey,
      avoma,
      front,
      slack,
      feedbackStore.items,
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

    // Update lastAnalyzedAt timestamp
    await writeFeedbackStore({
      lastAnalyzedAt: new Date().toISOString(),
      items: [...feedbackStore.items, ...newItems],
    })

    return NextResponse.json({
      newItems: newItems.length,
      totalItems: feedbackStore.items.length + newItems.length,
    })
  } catch (err) {
    console.error('Analysis error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
