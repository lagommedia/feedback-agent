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
      created_at TIMESTAMPTZ DEFAULT NOW(),
      permissions JSONB NOT NULL DEFAULT '["dashboard","integrations","feedback","chat","reports","users"]'::jsonb
    );
    ALTER TABLE app_users ADD COLUMN IF NOT EXISTS permissions JSONB NOT NULL DEFAULT '["dashboard","integrations","feedback","chat","reports","users"]'::jsonb;
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
    CREATE TABLE IF NOT EXISTS chat_sessions (
      id TEXT PRIMARY KEY,
      user_email TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT 'New Chat',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
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

export async function writeFeedbackStore(store: { lastAnalyzedAt: string; items?: import('@/types').FeedbackItem[] }): Promise<void> {
  await ensureSchema()
  if (store.items && store.items.length > 0) {
    await batchUpsert(
      'feedback_items',
      'id',
      store.items.map((item) => ({ id: item.id, data: item })),
      'update'
    )
  }
  const pool = getPool()
  await pool.query(
    "INSERT INTO app_meta (key, value) VALUES ('last_analyzed_at', $1) ON CONFLICT (key) DO UPDATE SET value = $1",
    [store.lastAnalyzedAt]
  )
}

// ─── Users ────────────────────────────────────────────────────────────────────

export const ALL_PERMISSIONS = ['dashboard', 'integrations', 'feedback', 'chat', 'reports', 'users'] as const
export type Permission = (typeof ALL_PERMISSIONS)[number]

export async function getUsers(): Promise<Array<{ email: string; createdAt: string; permissions: string[] }>> {
  await ensureSchema()
  const pool = getPool()
  const res = await pool.query('SELECT email, created_at, permissions FROM app_users ORDER BY created_at ASC')
  // If no users, seed the default admin
  if (res.rows.length === 0) {
    await pool.query(
      "INSERT INTO app_users (email, password) VALUES ('ben@zeni.ai', '$Zeni1234!') ON CONFLICT DO NOTHING"
    )
    return [{ email: 'ben@zeni.ai', createdAt: new Date().toISOString(), permissions: [...ALL_PERMISSIONS] }]
  }
  return res.rows.map((r) => ({
    email: r.email,
    createdAt: r.created_at,
    permissions: Array.isArray(r.permissions) ? r.permissions : [...ALL_PERMISSIONS],
  }))
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

export async function createUser(email: string, password: string, permissions?: string[]): Promise<void> {
  await ensureSchema()
  const pool = getPool()
  const perms = permissions ?? [...ALL_PERMISSIONS]
  await pool.query(
    'INSERT INTO app_users (email, password, permissions) VALUES ($1, $2, $3::jsonb)',
    [email.toLowerCase(), password, JSON.stringify(perms)]
  )
}

export async function updateUserPermissions(email: string, permissions: string[]): Promise<void> {
  await ensureSchema()
  const pool = getPool()
  await pool.query('UPDATE app_users SET permissions = $1::jsonb WHERE email = $2', [JSON.stringify(permissions), email.toLowerCase()])
}

export async function getUserPermissions(email: string): Promise<string[]> {
  await ensureSchema()
  const pool = getPool()
  const res = await pool.query('SELECT permissions FROM app_users WHERE email = $1', [email.toLowerCase()])
  if (res.rows.length === 0) return [...ALL_PERMISSIONS]
  return Array.isArray(res.rows[0].permissions) ? res.rows[0].permissions : [...ALL_PERMISSIONS]
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

// ─── Incremental Feedback Save ────────────────────────────────────────────────

/** Upsert a batch of new feedback items without loading all existing items. */
export async function appendFeedbackItems(items: import('@/types').FeedbackItem[]): Promise<void> {
  if (items.length === 0) return
  await ensureSchema()
  await batchUpsert(
    'feedback_items',
    'id',
    items.map((item) => ({ id: item.id, data: item })),
    'update'
  )
}

// ─── Chat Context Items ───────────────────────────────────────────────────────

export async function getRecentFeedbackItems(limit = 200): Promise<import('@/types').FeedbackItem[]> {
  await ensureSchema()
  const pool = getPool()
  const res = await pool.query(
    `SELECT data FROM feedback_items ORDER BY (data->>'date') DESC LIMIT $1`,
    [limit]
  )
  return res.rows.map((r) => r.data)
}

// ─── Distinct Customers ───────────────────────────────────────────────────────

export async function getDistinctCustomers(): Promise<string[]> {
  await ensureSchema()
  const pool = getPool()
  const res = await pool.query(`
    SELECT DISTINCT data->>'customer' AS customer
    FROM feedback_items
    WHERE data->>'customer' IS NOT NULL
      AND data->>'customer' != ''
      AND data->>'customer' != 'Unknown'
    ORDER BY customer
  `)
  return res.rows.map((r: { customer: string }) => r.customer)
}

// ─── Unanalyzed Content Fetchers ──────────────────────────────────────────────

/**
 * Returns Avoma transcripts that have NOT yet produced any feedback item.
 * Uses a NOT EXISTS subquery so we never load the full 18k-meeting history.
 */
export async function getUnanalyzedAvomaTranscripts(limit = 100): Promise<import('@/types').AvomaRawTranscript[]> {
  await ensureSchema()
  const pool = getPool()
  const res = await pool.query(
    `SELECT at.data
     FROM avoma_transcripts at
     WHERE NOT EXISTS (
       SELECT 1 FROM feedback_items fi
       WHERE fi.data->>'rawSourceId' = at.meeting_uuid
     )
       -- Skip outbound sales calls (phone number pattern in title)
       AND NOT (at.data->>'meetingTitle' ~* 'Call with .+ \\(\\+?1?[0-9]{10,11}\\)')
       -- Require at least 8 segments — filters out voicemails and tiny calls
       AND jsonb_array_length(at.data->'segments') >= 8
     ORDER BY (at.data->>'date') DESC
     LIMIT $1`,
    [limit]
  )
  return res.rows.map((r) => r.data)
}

/**
 * Returns Front conversations (with their messages) that have NOT yet produced
 * any feedback item. Messages are fetched in a single JOIN to avoid N+1 queries.
 */
export async function getUnanalyzedFrontConversations(limit = 75): Promise<{
  conversations: import('@/types').FrontRawConversation[]
  messages: import('@/types').FrontRawMessage[]
}> {
  await ensureSchema()
  const pool = getPool()
  const convRes = await pool.query(
    `SELECT fc.data
     FROM front_conversations fc
     WHERE NOT EXISTS (
       SELECT 1 FROM feedback_items fi
       WHERE fi.data->>'rawSourceId' = fc.id
     )
     ORDER BY (fc.data->>'created_at')::float ASC
     LIMIT $1`,
    [limit]
  )
  if (convRes.rows.length === 0) return { conversations: [], messages: [] }

  const convIds = convRes.rows.map((r) => r.data.id as string)
  const msgRes = await pool.query(
    `SELECT data FROM front_messages
     WHERE data->>'conversationId' = ANY($1::text[])`,
    [convIds]
  )
  return {
    conversations: convRes.rows.map((r) => r.data),
    messages: msgRes.rows.map((r) => r.data),
  }
}

/**
 * Returns the count of remaining unanalyzed items (for progress reporting).
 */
export async function getUnanalyzedCounts(): Promise<{ avoma: number; front: number }> {
  await ensureSchema()
  const pool = getPool()
  const [avoma, front] = await Promise.all([
    pool.query(`SELECT COUNT(*) FROM avoma_transcripts at
      WHERE NOT EXISTS (SELECT 1 FROM feedback_items fi WHERE fi.data->>'rawSourceId' = at.meeting_uuid)
        AND NOT (at.data->>'meetingTitle' ~* 'Call with .+ \\(\\+?1?[0-9]{10,11}\\)')
        AND jsonb_array_length(at.data->'segments') >= 8`),
    pool.query(`SELECT COUNT(*) FROM front_conversations fc
      WHERE NOT EXISTS (SELECT 1 FROM feedback_items fi WHERE fi.data->>'rawSourceId' = fc.id)`),
  ])
  return {
    avoma: parseInt(avoma.rows[0].count),
    front: parseInt(front.rows[0].count),
  }
}

// ─── Chat Sessions ────────────────────────────────────────────────────────────

export interface ChatSession {
  id: string
  userEmail: string
  title: string
  createdAt: string
  updatedAt: string
}

export interface ChatMessage {
  id: string
  sessionId: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
}

export async function createChatSession(id: string, userEmail: string, title = 'New Chat'): Promise<ChatSession> {
  await ensureSchema()
  const pool = getPool()
  const res = await pool.query(
    `INSERT INTO chat_sessions (id, user_email, title, created_at, updated_at)
     VALUES ($1, $2, $3, NOW(), NOW())
     RETURNING *`,
    [id, userEmail.toLowerCase(), title]
  )
  const r = res.rows[0]
  return { id: r.id, userEmail: r.user_email, title: r.title, createdAt: r.created_at, updatedAt: r.updated_at }
}

export async function getChatSessions(userEmail: string): Promise<ChatSession[]> {
  await ensureSchema()
  const pool = getPool()
  const res = await pool.query(
    `SELECT * FROM chat_sessions WHERE user_email = $1 ORDER BY updated_at DESC`,
    [userEmail.toLowerCase()]
  )
  return res.rows.map((r) => ({
    id: r.id,
    userEmail: r.user_email,
    title: r.title,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }))
}

export async function updateChatSessionTitle(sessionId: string, title: string): Promise<void> {
  await ensureSchema()
  const pool = getPool()
  await pool.query(
    `UPDATE chat_sessions SET title = $1, updated_at = NOW() WHERE id = $2`,
    [title, sessionId]
  )
}

export async function touchChatSession(sessionId: string): Promise<void> {
  await ensureSchema()
  const pool = getPool()
  await pool.query(`UPDATE chat_sessions SET updated_at = NOW() WHERE id = $1`, [sessionId])
}

export async function deleteChatSession(sessionId: string): Promise<void> {
  await ensureSchema()
  const pool = getPool()
  await pool.query(`DELETE FROM chat_messages WHERE session_id = $1`, [sessionId])
  await pool.query(`DELETE FROM chat_sessions WHERE id = $1`, [sessionId])
}

export async function saveChatMessage(
  id: string,
  sessionId: string,
  role: 'user' | 'assistant',
  content: string
): Promise<void> {
  await ensureSchema()
  const pool = getPool()
  await pool.query(
    `INSERT INTO chat_messages (id, session_id, role, content, created_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (id) DO NOTHING`,
    [id, sessionId, role, content]
  )
}

export async function getChatMessages(sessionId: string): Promise<ChatMessage[]> {
  await ensureSchema()
  const pool = getPool()
  const res = await pool.query(
    `SELECT * FROM chat_messages WHERE session_id = $1 ORDER BY created_at ASC`,
    [sessionId]
  )
  return res.rows.map((r) => ({
    id: r.id,
    sessionId: r.session_id,
    role: r.role as 'user' | 'assistant',
    content: r.content,
    createdAt: r.created_at,
  }))
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
