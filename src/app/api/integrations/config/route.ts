import { NextRequest, NextResponse } from 'next/server'
import { readConfig, writeConfig } from '@/lib/storage'
import type { IntegrationConfig } from '@/types'

export async function GET() {
  try {
    const config = await readConfig()

    // Mask sensitive values for display — show only last 4 chars
    const masked: IntegrationConfig = {}
    if (config.avoma) {
      masked.avoma = {
        ...config.avoma,
        apiKey: maskKey(config.avoma.apiKey),
      }
    }
    if (config.front) {
      masked.front = {
        ...config.front,
        bearerToken: maskKey(config.front.bearerToken),
      }
    }
    if (config.slack) {
      masked.slack = {
        ...config.slack,
        botToken: maskKey(config.slack.botToken),
      }
    }
    if (config.anthropic) {
      masked.anthropic = {
        ...config.anthropic,
        apiKey: maskKey(config.anthropic.apiKey),
      }
    }

    return NextResponse.json({ config: masked })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { integration, config: newConfig } = body as {
      integration: keyof IntegrationConfig
      config: IntegrationConfig[keyof IntegrationConfig]
    }

    const existing = await readConfig()

    // Merge new config — never overwrite an existing non-empty value with an empty string
    // (prevents the "Save without re-entering key" bug from wiping credentials)
    const existingSection = (existing[integration] ?? {}) as Record<string, unknown>
    const incoming = (newConfig ?? {}) as Record<string, unknown>
    const merged: Record<string, unknown> = { ...existingSection }
    for (const [k, v] of Object.entries(incoming)) {
      if (v === '' && existingSection[k]) continue // keep existing non-empty value
      merged[k] = v
    }

    const updated: IntegrationConfig = {
      ...existing,
      [integration]: merged,
    }

    await writeConfig(updated)
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

function maskKey(key: string): string {
  if (!key || key.length <= 4) return '****'
  return '****' + key.slice(-4)
}
