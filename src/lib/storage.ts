import { Pool } from 'pg'
import type {
  AvomaRawData,
  ChargebeeCustomer,
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

  // Core tables — CREATE TABLE IF NOT EXISTS is always safe to re-run
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
    CREATE TABLE IF NOT EXISTS analyzed_sources (
      source_id TEXT PRIMARY KEY,
      analyzed_at TIMESTAMPTZ DEFAULT NOW()
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
    CREATE TABLE IF NOT EXISTS chargebee_customers (
      customer_id TEXT PRIMARY KEY,
      company_name TEXT NOT NULL,
      email TEXT NOT NULL DEFAULT '',
      mrr NUMERIC NOT NULL DEFAULT 0,
      arr NUMERIC NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS company_assignments (
      company_name TEXT PRIMARY KEY,
      assigned_to TEXT NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS company_churn_scores (
      company_name TEXT PRIMARY KEY,
      score NUMERIC NOT NULL,
      confidence TEXT NOT NULL,
      reasoning TEXT,
      scored_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS company_churn_score_history (
      id SERIAL PRIMARY KEY,
      company_name TEXT NOT NULL,
      score NUMERIC NOT NULL,
      confidence TEXT NOT NULL,
      reasoning TEXT,
      scored_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_csh_company_scored ON company_churn_score_history(company_name, scored_at);
  `)

  // Column migrations — run separately so a no-op ALTER doesn't abort the block above
  await pool.query(`
    ALTER TABLE app_users ADD COLUMN IF NOT EXISTS permissions
      JSONB NOT NULL DEFAULT '["dashboard","integrations","feedback","chat","reports","users"]'::jsonb;
  `)
  await pool.query(`
    ALTER TABLE company_churn_scores ADD COLUMN IF NOT EXISTS explanation TEXT;
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
export async function getStoredTranscriptUuids(): Promise<Set<string>> {
  await ensureSchema()
  const pool = getPool()
  const res = await pool.query('SELECT meeting_uuid FROM avoma_transcripts')
  return new Set(res.rows.map((r: { meeting_uuid: string }) => r.meeting_uuid))
}

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
  // Use 'update' so re-synced conversations get fresh data (updated_at, status, etc.)
  await batchUpsert(
    'front_conversations',
    'id',
    newData.conversations.map((c) => ({ id: c.id, data: c })),
    'update'
  )
  // Use 'update' for messages too so edited/updated message bodies are refreshed
  await batchUpsert(
    'front_messages',
    'id',
    newData.messages.map((m) => ({ id: m.id, data: m })),
    'update'
  )
  const pool = getPool()
  await pool.query(
    "INSERT INTO app_meta (key, value) VALUES ('front_fetched_at', $1) ON CONFLICT (key) DO UPDATE SET value = $1",
    [newData.fetchedAt]
  )
  return newData
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

// Remove conversation IDs from analyzed_sources so they get re-analyzed.
// Only clears entries that have no feedback items (avoids duplicate feedback).
export async function unmarkAnalyzedSources(sourceIds: string[]): Promise<number> {
  if (sourceIds.length === 0) return 0
  await ensureSchema()
  const pool = getPool()
  const res = await pool.query(
    `DELETE FROM analyzed_sources
     WHERE source_id = ANY($1::text[])
       AND NOT EXISTS (
         SELECT 1 FROM feedback_items fi
         WHERE fi.data->>'rawSourceId' = analyzed_sources.source_id
       )`,
    [sourceIds]
  )
  return res.rowCount ?? 0
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
/** Mark a batch of source IDs as analyzed (even if they produced no feedback items). */
export async function markSourcesAnalyzed(sourceIds: string[]): Promise<void> {
  if (sourceIds.length === 0) return
  await ensureSchema()
  const pool = getPool()
  const values = sourceIds.map((_, i) => `($${i + 1})`).join(', ')
  await pool.query(
    `INSERT INTO analyzed_sources (source_id) VALUES ${values} ON CONFLICT (source_id) DO NOTHING`,
    sourceIds
  )
}

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
       AND NOT EXISTS (
         SELECT 1 FROM analyzed_sources ans
         WHERE ans.source_id = at.meeting_uuid
       )
       AND at.data->>'meetingTitle' NOT ILIKE 'Call with %'
       AND jsonb_array_length(at.data->'segments') >= 8
     ORDER BY (at.data->>'date') DESC
     LIMIT $1`,
    [limit]
  )
  return res.rows.map((r) => r.data)
}

export async function getUnanalyzedFrontConversations(limit = 75): Promise<{
  conversations: import('@/types').FrontRawConversation[]
  messages: import('@/types').FrontRawMessage[]
}> {
  await ensureSchema()
  const pool = getPool()
  const convRes = await pool.query(
    `SELECT fc.data
     FROM front_conversations fc
     -- Must have messages with real content (filters out 1-line system notifications)
     JOIN (
       SELECT data->>'conversationId' AS conv_id,
              SUM(length(COALESCE(data->>'text', ''))) AS total_text
       FROM front_messages
       GROUP BY data->>'conversationId'
     ) msg ON msg.conv_id = fc.id AND msg.total_text > 300
     WHERE NOT EXISTS (
       SELECT 1 FROM feedback_items fi
       WHERE fi.data->>'rawSourceId' = fc.id
     )
       AND NOT EXISTS (
         SELECT 1 FROM analyzed_sources ans
         WHERE ans.source_id = fc.id
       )
       -- Filter known noise subjects at DB level
       AND fc.data->>'subject' NOT ILIKE '%you''ve been assigned%'
       AND fc.data->>'subject' NOT ILIKE '%advance your%career%'
       AND fc.data->>'subject' NOT ILIKE '%newsletter%'
       AND fc.data->>'subject' NOT ILIKE '%unsubscribe%'
       AND fc.data->>'subject' NOT ILIKE '%out of office%'
       AND fc.data->>'subject' NOT ILIKE '%automatic reply%'
       AND fc.data->>'subject' NOT ILIKE '%delivery failure%'
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

export async function getUnanalyzedCounts(): Promise<{ avoma: number; front: number }> {
  await ensureSchema()
  const pool = getPool()
  const [avoma, front] = await Promise.all([
    pool.query(`SELECT COUNT(*) FROM avoma_transcripts at
      WHERE NOT EXISTS (SELECT 1 FROM feedback_items fi WHERE fi.data->>'rawSourceId' = at.meeting_uuid)
        AND NOT EXISTS (SELECT 1 FROM analyzed_sources ans WHERE ans.source_id = at.meeting_uuid)
        AND at.data->>'meetingTitle' NOT ILIKE 'Call with %'
        AND jsonb_array_length(at.data->'segments') >= 8`),
    pool.query(`SELECT COUNT(*) FROM front_conversations fc
      JOIN (
        SELECT data->>'conversationId' AS conv_id,
               SUM(length(COALESCE(data->>'text', ''))) AS total_text
        FROM front_messages
        GROUP BY data->>'conversationId'
      ) msg ON msg.conv_id = fc.id AND msg.total_text > 300
      WHERE NOT EXISTS (SELECT 1 FROM feedback_items fi WHERE fi.data->>'rawSourceId' = fc.id)
        AND NOT EXISTS (SELECT 1 FROM analyzed_sources ans WHERE ans.source_id = fc.id)
        AND fc.data->>'subject' NOT ILIKE '%you''ve been assigned%'
        AND fc.data->>'subject' NOT ILIKE '%advance your%career%'
        AND fc.data->>'subject' NOT ILIKE '%newsletter%'
        AND fc.data->>'subject' NOT ILIKE '%unsubscribe%'
        AND fc.data->>'subject' NOT ILIKE '%out of office%'
        AND fc.data->>'subject' NOT ILIKE '%automatic reply%'
        AND fc.data->>'subject' NOT ILIKE '%delivery failure%'`),
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

// ─── Chargebee Customers ─────────────────────────────────────────────────────

export async function upsertChargebeeCustomers(customers: ChargebeeCustomer[]): Promise<void> {
  await ensureSchema()
  if (customers.length === 0) return
  const pool = getPool()
  for (const c of customers) {
    await pool.query(
      `INSERT INTO chargebee_customers (customer_id, company_name, email, mrr, arr, status, synced_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (customer_id) DO UPDATE SET
         company_name = EXCLUDED.company_name,
         email        = EXCLUDED.email,
         mrr          = EXCLUDED.mrr,
         arr          = EXCLUDED.arr,
         status       = EXCLUDED.status,
         synced_at    = EXCLUDED.synced_at`,
      [c.customerId, c.companyName, c.email, c.mrr, c.arr, c.status],
    )
  }
}

export async function getCompanyAssignments(): Promise<Record<string, string>> {
  await ensureSchema()
  const pool = getPool()
  const res = await pool.query('SELECT company_name, assigned_to FROM company_assignments')
  const map: Record<string, string> = {}
  for (const r of res.rows) map[r.company_name] = r.assigned_to
  return map
}

export async function setCompanyAssignment(companyName: string, assignedTo: string | null): Promise<void> {
  await ensureSchema()
  const pool = getPool()
  if (!assignedTo) {
    await pool.query('DELETE FROM company_assignments WHERE company_name = $1', [companyName])
  } else {
    await pool.query(
      `INSERT INTO company_assignments (company_name, assigned_to, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (company_name) DO UPDATE SET assigned_to = EXCLUDED.assigned_to, updated_at = NOW()`,
      [companyName, assignedTo],
    )
  }
}

export async function getChargebeeCustomers(): Promise<ChargebeeCustomer[]> {
  await ensureSchema()
  const pool = getPool()
  const res = await pool.query(
    'SELECT customer_id, company_name, email, mrr, arr, status FROM chargebee_customers ORDER BY mrr DESC',
  )
  return res.rows.map((r) => ({
    customerId: r.customer_id,
    companyName: r.company_name,
    email: r.email,
    mrr: parseFloat(r.mrr),
    arr: parseFloat(r.arr),
    status: r.status,
  }))
}

export interface ChurnScore {
  companyName: string
  score: number
  confidence: 'high' | 'medium' | 'low'
  reasoning: string
  scoredAt: string
}

export async function upsertChurnScores(scores: ChurnScore[]): Promise<void> {
  await ensureSchema()
  if (scores.length === 0) return
  const pool = getPool()
  const now = new Date()
  for (const s of scores) {
    // Upsert the current (latest) score
    await pool.query(
      `INSERT INTO company_churn_scores (company_name, score, confidence, reasoning, scored_at, explanation)
       VALUES ($1, $2, $3, $4, $5, NULL)
       ON CONFLICT (company_name) DO UPDATE SET
         score = EXCLUDED.score,
         confidence = EXCLUDED.confidence,
         reasoning = EXCLUDED.reasoning,
         scored_at = EXCLUDED.scored_at,
         explanation = NULL`,
      [s.companyName, s.score, s.confidence, s.reasoning, now],
    )
    // Append to history — keeps every snapshot for before/after tracking
    await pool.query(
      `INSERT INTO company_churn_score_history (company_name, score, confidence, reasoning, scored_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [s.companyName, s.score, s.confidence, s.reasoning, now],
    )
  }
}

export async function getCompanyReps(companyName: string): Promise<string[]> {
  await ensureSchema()
  const pool = getPool()
  // Cross-reference against app_users so we only return actual Zeni team members.
  // Extracts the first name segment from each user's email (e.g. "ben.ashworth@zeni.ai" → "ben")
  // and checks whether the rep name in feedback contains it — filters out customer contacts.
  const res = await pool.query(
    `SELECT DISTINCT fi.data->>'rep' AS rep
     FROM feedback_items fi
     WHERE LOWER(fi.data->>'customer') = LOWER($1)
       AND fi.data->>'rep' IS NOT NULL
       AND fi.data->>'rep' != 'Unknown'
       AND EXISTS (
         SELECT 1 FROM app_users au
         WHERE LOWER(fi.data->>'rep') ILIKE
           '%' || SPLIT_PART(SPLIT_PART(LOWER(au.email), '@', 1), '.', 1) || '%'
       )
     LIMIT 5`,
    [companyName],
  )
  return res.rows.map((r: { rep: string }) => r.rep).filter(Boolean)
}

export async function getChurnExplanation(companyName: string): Promise<string | null> {
  await ensureSchema()
  const pool = getPool()
  const res = await pool.query(
    `SELECT explanation FROM company_churn_scores WHERE LOWER(company_name) = LOWER($1)`,
    [companyName],
  )
  return res.rows[0]?.explanation ?? null
}

export async function cacheChurnExplanation(companyName: string, explanation: string): Promise<void> {
  await ensureSchema()
  const pool = getPool()
  await pool.query(
    `UPDATE company_churn_scores SET explanation = $1 WHERE LOWER(company_name) = LOWER($2)`,
    [explanation, companyName],
  )
}

export interface ChurnScoreDelta {
  companyName: string
  arr: number           // annual recurring revenue from Chargebee
  mrr: number
  initialScore: number
  initialConfidence: string
  initialReasoning: string
  initialScoredAt: string
  latestScore: number
  latestConfidence: string
  latestReasoning: string
  latestScoredAt: string
  delta: number          // positive = worsening risk, negative = improving
  snapshotCount: number
  explanation?: string   // AI-generated "why the score changed" — cached in DB
}

/**
 * Returns companies that have been scored at least twice, showing the
 * first (baseline) vs latest score so you can track risk changes over time.
 */
export async function getChurnScoreDeltas(): Promise<ChurnScoreDelta[]> {
  await ensureSchema()
  const pool = getPool()

  // Seed history from current scores for any company not yet in history
  await pool.query(`
    INSERT INTO company_churn_score_history (company_name, score, confidence, reasoning, scored_at)
    SELECT cs.company_name, cs.score, cs.confidence, cs.reasoning, cs.scored_at
    FROM company_churn_scores cs
    WHERE NOT EXISTS (
      SELECT 1 FROM company_churn_score_history h WHERE h.company_name = cs.company_name
    )
  `)

  const res = await pool.query(`
    WITH first_scores AS (
      SELECT DISTINCT ON (company_name)
        company_name, score, confidence, reasoning, scored_at
      FROM company_churn_score_history
      ORDER BY company_name, scored_at ASC
    ),
    latest_scores AS (
      SELECT DISTINCT ON (company_name)
        company_name, score, confidence, reasoning, scored_at
      FROM company_churn_score_history
      ORDER BY company_name, scored_at DESC
    ),
    counts AS (
      SELECT company_name, COUNT(*) AS snapshot_count
      FROM company_churn_score_history
      GROUP BY company_name
    )
    SELECT
      f.company_name,
      COALESCE(cc.arr, 0)  AS arr,
      COALESCE(cc.mrr, 0)  AS mrr,
      f.score              AS initial_score,
      f.confidence         AS initial_confidence,
      f.reasoning          AS initial_reasoning,
      f.scored_at          AS initial_scored_at,
      l.score              AS latest_score,
      l.confidence         AS latest_confidence,
      l.reasoning          AS latest_reasoning,
      l.scored_at          AS latest_scored_at,
      (l.score - f.score)  AS delta,
      c.snapshot_count,
      cs.explanation
    FROM first_scores f
    JOIN latest_scores  l USING (company_name)
    JOIN counts         c USING (company_name)
    -- Only include verified Chargebee customers — filters out individuals/prospects
    JOIN chargebee_customers cc ON LOWER(cc.company_name) = LOWER(f.company_name)
    -- Pull cached explanation from latest score row
    LEFT JOIN company_churn_scores cs ON LOWER(cs.company_name) = LOWER(f.company_name)
    WHERE c.snapshot_count >= 2
    ORDER BY ABS(l.score - f.score) DESC, l.score DESC
  `)

  return res.rows.map((r) => ({
    companyName:        r.company_name,
    arr:                parseFloat(r.arr),
    mrr:                parseFloat(r.mrr),
    initialScore:       parseFloat(r.initial_score),
    initialConfidence:  r.initial_confidence,
    initialReasoning:   r.initial_reasoning ?? '',
    initialScoredAt:    r.initial_scored_at,
    latestScore:        parseFloat(r.latest_score),
    latestConfidence:   r.latest_confidence,
    latestReasoning:    r.latest_reasoning ?? '',
    latestScoredAt:     r.latest_scored_at,
    delta:              parseFloat(r.delta),
    snapshotCount:      parseInt(r.snapshot_count),
    explanation:        r.explanation ?? undefined,
  }))
}

export async function getChurnScores(): Promise<Record<string, ChurnScore>> {
  await ensureSchema()
  const pool = getPool()
  const res = await pool.query(
    'SELECT company_name, score, confidence, reasoning, scored_at FROM company_churn_scores'
  )
  const map: Record<string, ChurnScore> = {}
  for (const r of res.rows) {
    map[r.company_name] = {
      companyName: r.company_name,
      score: parseFloat(r.score),
      confidence: r.confidence,
      reasoning: r.reasoning ?? '',
      scoredAt: r.scored_at,
    }
  }
  return map
}
