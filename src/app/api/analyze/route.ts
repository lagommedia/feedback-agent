import { NextResponse } from 'next/server'
import {
  readAvomaRaw,
  readConfig,
  readFeedbackStore,
  readFrontRaw,
  readSlackRaw,
  writeFeedbackStore,
  getTrainingExamples,
} from '@/lib/storage'
import { analyzeAllContent } from '@/lib/anthropic'

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
      trainingExamples
    )

    const updatedStore = {
      lastAnalyzedAt: new Date().toISOString(),
      items: [...feedbackStore.items, ...newItems],
    }

    await writeFeedbackStore(updatedStore)

    return NextResponse.json({
      newItems: newItems.length,
      totalItems: updatedStore.items.length,
    })
  } catch (err) {
    console.error('Analysis error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
