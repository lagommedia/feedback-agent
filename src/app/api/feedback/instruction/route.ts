import { NextRequest, NextResponse } from 'next/server'
import { readConfig, writeConfig } from '@/lib/storage'
import Anthropic from '@anthropic-ai/sdk'
import type { FeedbackItem } from '@/types'

export async function POST(req: NextRequest) {
  try {
    const { item, feedbackText }: { item: FeedbackItem; feedbackText: string } = await req.json()

    if (!item || !feedbackText?.trim()) {
      return NextResponse.json({ error: 'Missing item or feedbackText' }, { status: 400 })
    }

    const config = await readConfig()
    const apiKey = config.anthropic?.apiKey
    if (!apiKey) {
      return NextResponse.json({ error: 'Anthropic API key not configured' }, { status: 400 })
    }

    const client = new Anthropic({ apiKey })

    const prompt = `You are a configuration assistant for an AI-powered product feedback analysis system used by Zeni (a fintech company).

A user has reviewed the following customer feedback ticket and provided their own commentary on it. Your job is to convert that commentary into a concise, specific AI instruction that should be appended to the global AI instructions for the system. This instruction will guide how the AI analyzes and categorizes future feedback.

TICKET:
- Title: ${item.title}
- Type: ${item.type}
- Customer: ${item.customer}
- Zeni Rep: ${item.rep}
- Urgency: ${item.urgency}
- Product Areas: ${(item.tags ?? []).join(', ') || 'None'}
- Description: ${item.description}

USER'S COMMENTARY:
${feedbackText}

Write a single, actionable AI instruction (1–3 sentences) that captures what the user wants the AI to learn or do differently based on this feedback. Do not include preamble, labels, or quotes — output only the instruction text itself.`

    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    })

    const instruction = (message.content[0] as { type: string; text: string }).text.trim()

    // Append the new instruction to existing anthropic instructions
    const existing = config.anthropic?.instructions ?? ''
    const separator = existing.trim() ? '\n\n' : ''
    const updated = existing + separator + instruction

    await writeConfig({
      ...config,
      anthropic: {
        ...(config.anthropic ?? { apiKey }),
        instructions: updated,
      },
    })

    return NextResponse.json({ instruction, instructions: updated })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
