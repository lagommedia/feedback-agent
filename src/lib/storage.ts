import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type {
  AvomaRawData,
  FeedbackStore,
  FrontRawData,
  IntegrationConfig,
  SlackRawData,
} from '@/types'

const DATA_DIR = path.join(process.cwd(), 'data')

async function ensureDataDir(): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true })
}

async function readJSON<T>(filename: string, defaultValue: T): Promise<T> {
  try {
    const filePath = path.join(DATA_DIR, filename)
    const raw = await readFile(filePath, 'utf8')
    return JSON.parse(raw) as T
  } catch {
    return defaultValue
  }
}

async function atomicWriteJSON(filename: string, data: unknown): Promise<void> {
  await ensureDataDir()
  const filePath = path.join(DATA_DIR, filename)
  const tmpPath = filePath + '.tmp'
  await writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf8')
  await rename(tmpPath, filePath)
}

// ─── Config ───────────────────────────────────────────────────────────────────

export async function readConfig(): Promise<IntegrationConfig> {
  return readJSON<IntegrationConfig>('config.json', {})
}

export async function writeConfig(config: IntegrationConfig): Promise<void> {
  await atomicWriteJSON('config.json', config)
}

// ─── Avoma Raw ────────────────────────────────────────────────────────────────

export async function readAvomaRaw(): Promise<AvomaRawData | null> {
  return readJSON<AvomaRawData | null>('avoma-raw.json', null)
}

export async function writeAvomaRaw(data: AvomaRawData): Promise<void> {
  await atomicWriteJSON('avoma-raw.json', data)
}

/** Merge new Avoma data into existing, deduplicating by uuid */
export async function mergeAvomaRaw(newData: AvomaRawData): Promise<AvomaRawData> {
  const existing = await readAvomaRaw()
  if (!existing) {
    await writeAvomaRaw(newData)
    return newData
  }
  const meetingIds = new Set(existing.meetings.map((m) => m.uuid))
  const transcriptIds = new Set(existing.transcripts.map((t) => t.meetingUuid))
  const merged: AvomaRawData = {
    fetchedAt: newData.fetchedAt,
    meetings: [
      ...existing.meetings,
      ...newData.meetings.filter((m) => !meetingIds.has(m.uuid)),
    ],
    transcripts: [
      ...existing.transcripts,
      ...newData.transcripts.filter((t) => !transcriptIds.has(t.meetingUuid)),
    ],
  }
  await writeAvomaRaw(merged)
  return merged
}

// ─── Front Raw ────────────────────────────────────────────────────────────────

export async function readFrontRaw(): Promise<FrontRawData | null> {
  return readJSON<FrontRawData | null>('front-raw.json', null)
}

export async function writeFrontRaw(data: FrontRawData): Promise<void> {
  await atomicWriteJSON('front-raw.json', data)
}

/** Merge new Front data into existing, deduplicating by id */
export async function mergeFrontRaw(newData: FrontRawData): Promise<FrontRawData> {
  const existing = await readFrontRaw()
  if (!existing) {
    await writeFrontRaw(newData)
    return newData
  }
  const convoIds = new Set(existing.conversations.map((c) => c.id))
  const msgIds = new Set(existing.messages.map((m) => m.id))
  const merged: FrontRawData = {
    fetchedAt: newData.fetchedAt,
    conversations: [
      ...existing.conversations,
      ...newData.conversations.filter((c) => !convoIds.has(c.id)),
    ],
    messages: [
      ...existing.messages,
      ...newData.messages.filter((m) => !msgIds.has(m.id)),
    ],
  }
  await writeFrontRaw(merged)
  return merged
}

// ─── Slack Raw ────────────────────────────────────────────────────────────────

export async function readSlackRaw(): Promise<SlackRawData | null> {
  return readJSON<SlackRawData | null>('slack-raw.json', null)
}

export async function writeSlackRaw(data: SlackRawData): Promise<void> {
  await atomicWriteJSON('slack-raw.json', data)
}

// ─── Feedback Store ───────────────────────────────────────────────────────────

export async function readFeedbackStore(): Promise<FeedbackStore> {
  return readJSON<FeedbackStore>('feedback.json', {
    lastAnalyzedAt: '',
    items: [],
  })
}

export async function writeFeedbackStore(store: FeedbackStore): Promise<void> {
  await atomicWriteJSON('feedback.json', store)
}
