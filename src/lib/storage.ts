import { Pool } from 'pg'
import type {
  AvomaRawData,
  FeedbackStore,
  FrontRawData,
  IntegrationConfig,
  SlackRawData,
} from '@/types'

// ─── Connection Pool ──────────────────────────────────────────────────────────

let _pool: Pool | null = null

function getPool(): Pool {
  if (!_pool) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set')
    _pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    })
  }
  return _pool
}

// ─── Schema Init (idempotent) ──────────────────────────────────────────────────

let _schemaReady = false

async function ensureSchema(): Promise<void> {
  if (_schemaReady) return
  const pool = getPool()
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_config (
      id INTEGER PRIMARY KEY DEFAULT 1,
      data JSONB NOT NULL DEFAULT '{}'
    );
    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS feedback_items (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL
    );
    CREATE TABLE IF NOT EXISTS avoma_meetings (
      uuid TEXT PRIMARY KEY,
      data JSONB NOT NULL
    );
    CREATE TABLE IF NOT EXISTS avoma_transcripts (
      meeting_uuid TEXT PRIMARY KEY,
      data JSONB NOT NULL
    );
    CREATE TABLE IF NOT EXISTS front_conversations (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL
    );
    CREATE TABLE IF NOT EXISTS front_messages (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL
    );
    CREATE TABLE IF NOT EXISTS slack_messages (
      ts TEXT NOT NULL,
      channel TEXT NOT NULL,
      data JSONB NOT NULL,
      PRIMARY KEY (ts, channel)
    );
    CREATE TABLE IF NOT EXISTS slack_channels (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS app_users (
      email TEXT PRIMARY KEY,
      password TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS training_examples (
      id SERIAL PRIMARY KEY,
      feedback_id TEXT,
      original_app_type TEXT,
      correct_app_type TEXT,
      notes TEXT NOT NULL,
      feedback_title TEXT,
      feedback_description TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `)
  _schemaReady = true
}

// ─── Bulk Upsert Helper ────────────────────────────────────────────────────────

async function batchUpsert(
  table: string,
  idCol: string,
  rows: { id: string; data: unknown }[],
  onConflict: 'nothing' | 'update' = 'update'
): Promise<void> {
  if (rows.length === 0) return
  const pool = getPool()
  const client = await pool.connect()
  try {
    const BATCH = 200
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH)
      const values = batch.map((_, j) => `($${j * 2 + 1}, $${j * 2 + 2}::jsonb)`).join(', ')
      const params = batch.flatMap((r) => [r.id, JSON.stringify(r.data)])
      const conflict =
        onConflict === 'update'
          ? `ON CONFLICT (${idCol}) DO UPDATE SET data = EXCLUDED.data`
          : `ON CONFLICT (${idCol}) DO NOTHING`
      await client.query(
        `INSERT INTO ${table} (${idCol}, data) VALUES ${values} ${conflict}`,
        params
      )
    }
  } finally {
    client.release()
  }
}

// ─── Config ───────────────────────────────────────────────────────────────────

export async function readConfig(): Promise<IntegrationConfig> {
  await ensureSchema()
  const pool = getPool()
  const res = await pool.query('SELECT data FROM app_config WHERE id = 1')
  if (res.rows.length === 0) return {}
  return res.rows[0].data as IntegrationConfig
}

export async function writeConfig(config: IntegrationConfig): Promise<void> {
  await ensureSchema()
  const pool = getPool()
  await pool.query(`
    INSERT INTO app_config (id, data) VALUES (1, $1::jsonb)
    ON CONFLICT (id) DO UPDATE SET data = $1::jsonb
  `, [JSON.stringify(config)])
}

// ─── Avoma Raw ────────────────────────────────────────────────────────────────

export async function readAvomaRaw(): Promise<AvomaRawData | null> {
  await ensureSchema()
  const pool = getPool()
  const [meetings, transcripts, meta] = await Promise.all([
    pool.query('SELECT data FROM avoma_meetings'),
    pool.query('SELECT data FROM avoma_transcripts'),
    pool.query("SELECT value FROM app_meta WHERE key = 'avoma_fetched_at'"),
  ])
  if (meetings.rows.length === 0 && transcripts.rows.length === 0) return null
  return {
    fetchedAt: meta.rows[0]?.value ?? new Date().toISOString(),
    meetings: meetings.rows.map((r) => r.data),
    transcripts: transcripts.rows.map((r) => r.data),
  }
}

export async function writeAvomaRaw(data: AvomaRawData): Promise<void> {
  await ensureSchema()
  const pool = getPool()
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('TRUNCATE avoma_meetings, avoma_transcripts')
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
  await batchUpsert('avoma_meetings', 'uuid', data.meetings.map((m) => ({ id: m.uuid, data: m })))
  await batchUpsert('avoma_transcripts', 'meeting_uuid', data.transcripts.map((t) => ({ id: t.meetingUuid, data: t })))
  const pool2 = getPool()
  await pool2.query(
    "INSERT INTO app_meta (key, value) VALUES ('avoma_fetched_at', $1) ON CONFLICT (key) DO UPDATE SET value = $1",
    [data.fetchedAt]
  )
}

/** Merge new Avoma data into existing, deduplicating by uuid */
export async function mergeAvomaRaw(newData: AvomaRawData): Promise<AvomaRawData> {
  await ensureSchema()
  // Insert meetings (skip duplicates)
  await batchUpsert(
    'avoma_meetings',
    'uuid',
    newData.meetings.map((m) => ({ id: m.uuid, data: m })),
    'nothing'
  )
  // Insert transcripts (skip duplicates)
  await batchUpsert(
    'avoma_transcripts',
    'meeting_uuid',
    newData.transcripts.map((t) => ({ id: t.meetingUuid, data: t })),
    'nothing'
  )
  // Update fetched_at
  const pool = getPool()
  await pool.query(
    "INSERT INTO app_meta (key, value) VALUES ('avoma_fetched_at', $1) ON CONFLICT (key) DO UPDATE SET value = $1",
    [newData.fetchedAt]
  )
  return (await readAvomaRaw())!
}

// ─── Front Raw ────────────────────────────────────────────────────────────────

export async function readFrontRaw(): Promise<FrontRawData | null> {
  await ensureSchema()
  const pool = getPool()
  const [convos, messages, meta] = await Promise.all([
    pool.query('SELECT data FROM front_conversations'),
    pool.query('SELECT data FROM front_messages'),
    pool.query("SELECT value FROM app_meta WHERE key = 'front_fetched_at'"),
  ])
  if (convos.rows.length === 0 && messages.rows.length === 0) return null
  return {
    fetchedAt: meta.rows[0]?.value ?? new Date().toISOString(),
    conversations: convos.rows.map((r) => r.data),
    messages: messages.rows.map((r) => r.data),
  }
}

export async function writeFrontRaw(data: FrontRawData): Promise<void> {
  await ensureSchema()
  const pool = getPool()
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('TRUNCATE front_conversations, front_messages')
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
  await batchUpsert('front_conversations', 'id', data.conversations.map((c) => ({ id: c.id, data: c })))
  await batchUpsert('front_messages', 'id', data.messages.map((m) => ({ id: m.id, data: m })))
  const pool2 = getPool()
  await pool2.query(
    "INSERT INTO app_meta (key, value) VALUES ('front_fetched_at', $1) ON CONFLICT (key) DO UPDATE SET value = $1",
    [data.fetchedAt]
  )
}

/** Merge new Front data into existing, deduplicating by id */
export async function mergeFrontRaw(newData: FrontRawData): Promise<FrontRawData> {
  await ensureSchema()
  await batchUpsert(
    'front_conversations',
    'id',
    newData.conversations.map((c) => ({ id: c.id, data: c })),
    'nothing'
  )
  await batchUpsert(
    'front_messages',
    'id',
    newData.messages.map((m) => ({ id: m.id, data: m })),
    'nothing'
  )
  const pool = getPool()
  await pool.query(
    "INSERT INTO app_meta (key, value) VALUES ('front_fetched_at', $1) ON CONFLICT (key) DO UPDATE SET value = $1",
    [newData.fetchedAt]
  )
  return (await readFrontRaw())!
}

// ─── Slack Raw ────────────────────────────────────────────────────────────────

export async function readSlackRaw(): Promise<SlackRawData | null> {
  await ensureSchema()
  const pool = getPool()
  const [channels, messages, meta] = await Promise.all([
    pool.query('SELECT id, name FROM slack_channels'),
    pool.query('SELECT data FROM slack_messages'),
    pool.query("SELECT value FROM app_meta WHERE key = 'slack_fetched_at'"),
  ])
  if (channels.rows.length === 0 && messages.rows.length === 0) return null
  return {
    fetchedAt: meta.rows[0]?.value ?? new Date().toISOString(),
    channels: channels.rows.map((r) => ({ id: r.id, name: r.name })),
    messages: messages.rows.map((r) => r.data),
  }
}

export async function writeSlackRaw(data: SlackRawData): Promise<void> {
  await ensureSchema()
  const pool = getPool()
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('TRUNCATE slack_messages, slack_channels')
    // Insert channels
    for (const ch of data.channels) {
      await client.query(
        'INSERT INTO slack_channels (id, name) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET name = $2',
        [ch.id, ch.name]
      )
    }
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
  // Insert messages in batches
  const rows = data.messages.map((m) => ({ id: `${m.channel}:${m.ts}`, data: m }))
  if (rows.length > 0) {
    const client2 = await pool.connect()
    try {
      const BATCH = 200
      for (let i = 0; i < rows.length; i += BATCH) {
        const batch = rows.slice(i, i + BATCH)
        const vals = batch
          .map((_, j) => `($${j * 3 + 1}, $${j * 3 + 2}, $${j * 3 + 3}::jsonb)`)
          .join(', ')
        const params = batch.flatMap((r) => {
          const m = r.data as { ts: string; channel: string }
          return [m.ts, m.channel, JSON.stringify(r.data)]
        })
        await client2.query(
          `INSERT INTO slack_messages (ts, channel, data) VALUES ${vals} ON CONFLICT (ts, channel) DO NOTHING`,
          params
        )
      }
    } finally {
      client2.release()
    }
  }
  await pool.query(
    "INSERT INTO app_meta (key, value) VALUES ('slack_fetched_at', $1) ON CONFLICT (key) DO UPDATE SET value = $1",
    [data.fetchedAt]
  )
}

// ─── Feedback Item Operations ─────────────────────────────────────────────────

export async function deleteFeedbackItem(id: string): Promise<void> {
  await ensureSchema()
  const pool = getPool()
  await pool.query('DELETE FROM feedback_items WHERE id = $1', [id])
}

export async function updateFeedbackItemAppType(id: string, appType: string): Promise<void> {
  await ensureSchema()
  const pool = getPool()
  await pool.query(
    "UPDATE feedback_items SET data = data || jsonb_build_object('appType', $1::text) WHERE id = $2",
    [appType, id]
  )
}

export async function getFeedbackItem(id: string): Promise<import('@/types').FeedbackItem | null> {
  await ensureSchema()
  const pool = getPool()
  const res = await pool.query('SELECT data FROM feedback_items WHERE id = $1', [id])
  return res.rows[0]?.data ?? null
}

// ─── Feedback Store ───────────────────────────────────────────────────────────

export async function readFeedbackStore(): Promise<FeedbackStore> {
  await ensureSchema()
  const pool = getPool()
  const [items, meta] = await Promise.all([
    pool.query('SELECT data FROM feedback_items'),
    pool.query("SELECT value FROM app_meta WHERE key = 'last_analyzed_at'"),
  ])
  return {
    lastAnalyzedAt: meta.rows[0]?.value ?? '',
    items: items.rows.map((r) => r.data),
  }
}

export async function writeFeedbackStore(store: FeedbackStore): Promise<void> {
  await ensureSchema()
  await batchUpsert(
    'feedback_items',
    'id',
    store.items.map((item) => ({ id: item.id, data: item })),
    'update'
  )
  const pool = getPool()
  await pool.query(
    "INSERT INTO app_meta (key, value) VALUES ('last_analyzed_at', $1) ON CONFLICT (key) DO UPDATE SET value = $1",
    [store.lastAnalyzedAt]
  )
}

// ─── Users ────────────────────────────────────────────────────────────────────

export async function getUsers(): Promise<Array<{ email: string; createdAt: string }>> {
  await ensureSchema()
  const pool = getPool()
  const res = await pool.query('SELECT email, created_at FROM app_users ORDER BY created_at ASC')
  // If no users, seed the default admin
  if (res.rows.length === 0) {
    await pool.query(
      "INSERT INTO app_users (email, password) VALUES ('ben@zeni.ai', '$Zeni1234!') ON CONFLICT DO NOTHING"
    )
    return [{ email: 'ben@zeni.ai', createdAt: new Date().toISOString() }]
  }
  return res.rows.map((r) => ({ email: r.email, createdAt: r.created_at }))
}

export async function validateUserCredentials(email: string, password: string): Promise<boolean> {
  await ensureSchema()
  const pool = getPool()
  let res = await pool.query('SELECT password FROM app_users WHERE email = $1', [email.toLowerCase()])
  // Fall back to seeding default user if table is empty
  if (res.rows.length === 0) {
    await pool.query(
      "INSERT INTO app_users (email, password) VALUES ('ben@zeni.ai', '$Zeni1234!') ON CONFLICT DO NOTHING"
    )
    res = await pool.query('SELECT password FROM app_users WHERE email = $1', [email.toLowerCase()])
  }
  if (res.rows.length === 0) return false
  return res.rows[0].password === password
}

export async function createUser(email: string, password: string): Promise<void> {
  await ensureSchema()
  const pool = getPool()
  await pool.query(
    'INSERT INTO app_users (email, password) VALUES ($1, $2)',
    [email.toLowerCase(), password]
  )
}

export async function updateUserPassword(email: string, password: string): Promise<void> {
  await ensureSchema()
  const pool = getPool()
  await pool.query('UPDATE app_users SET password = $1 WHERE email = $2', [password, email.toLowerCase()])
}

export async function deleteUser(email: string): Promise<void> {
  await ensureSchema()
  const pool = getPool()
  await pool.query('DELETE FROM app_users WHERE email = $1', [email.toLowerCase()])
}

// ─── Training Examples ─────────────────────────────────────────────────────────

export interface TrainingExample {
  originalAppType: string
  correctAppType: string | null  // null = should be removed/not feedback
  notes: string
  feedbackTitle: string
  feedbackDescription: string
  createdAt: string
}

export async function saveTrainingExample(example: {
  feedbackId: string
  originalAppType: string
  correctAppType: string | null
  notes: string
  feedbackTitle: string
  feedbackDescription: string
}): Promise<void> {
  await ensureSchema()
  const pool = getPool()
  await pool.query(
    `INSERT INTO training_examples (feedback_id, original_app_type, correct_app_type, notes, feedback_title, feedback_description)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      example.feedbackId,
      example.originalAppType,
      example.correctAppType,
      example.notes,
      example.feedbackTitle,
      example.feedbackDescription,
    ]
  )
}

export async function getTrainingExamples(): Promise<TrainingExample[]> {
  await ensureSchema()
  const pool = getPool()
  const res = await pool.query(
    `SELECT original_app_type, correct_app_type, notes, feedback_title, feedback_description, created_at
     FROM training_examples
     ORDER BY created_at DESC
     LIMIT 100`
  )
  return res.rows.map((r) => ({
    originalAppType: r.original_app_type,
    correctAppType: r.correct_app_type,
    notes: r.notes,
    feedbackTitle: r.feedback_title,
    feedbackDescription: r.feedback_description,
    createdAt: r.created_at,
  }))
}
