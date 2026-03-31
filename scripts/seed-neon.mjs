/**
 * Seed Neon Postgres from local data/ JSON files.
 * Run once: node scripts/seed-neon.mjs
 * Requires DATABASE_URL in .env.local
 */

import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import pg from 'pg'
const { Pool } = pg

// ─── Load .env.local ──────────────────────────────────────────────────────────
const envPath = resolve('.env.local')
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    process.env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim()
  }
  console.log('[seed] Loaded .env.local')
}

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) { console.error('ERROR: DATABASE_URL not set'); process.exit(1) }

const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3 })
const DATA_DIR = resolve('./data')

// ─── Create schema ────────────────────────────────────────────────────────────
console.log('[seed] Creating tables...')
await pool.query(`
  CREATE TABLE IF NOT EXISTS app_config (id INTEGER PRIMARY KEY DEFAULT 1, data JSONB NOT NULL DEFAULT '{}');
  CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS feedback_items (id TEXT PRIMARY KEY, data JSONB NOT NULL);
  CREATE TABLE IF NOT EXISTS avoma_meetings (uuid TEXT PRIMARY KEY, data JSONB NOT NULL);
  CREATE TABLE IF NOT EXISTS avoma_transcripts (meeting_uuid TEXT PRIMARY KEY, data JSONB NOT NULL);
  CREATE TABLE IF NOT EXISTS front_conversations (id TEXT PRIMARY KEY, data JSONB NOT NULL);
  CREATE TABLE IF NOT EXISTS front_messages (id TEXT PRIMARY KEY, data JSONB NOT NULL);
  CREATE TABLE IF NOT EXISTS slack_messages (ts TEXT NOT NULL, channel TEXT NOT NULL, data JSONB NOT NULL, PRIMARY KEY (ts, channel));
  CREATE TABLE IF NOT EXISTS slack_channels (id TEXT PRIMARY KEY, name TEXT NOT NULL);
`)
console.log('[seed] Tables ready.')

// ─── Helpers ──────────────────────────────────────────────────────────────────

function loadJSON(filename) {
  const p = `${DATA_DIR}/${filename}`
  if (!existsSync(p)) { console.log(`[seed] Skipping ${filename} (not found)`); return null }
  const sizeMB = (readFileSync(p).length / 1024 / 1024).toFixed(1)
  console.log(`[seed] Loading ${filename} (${sizeMB} MB)...`)
  return JSON.parse(readFileSync(p, 'utf8'))
}

async function batchUpsert(table, idCol, rows, onConflict = 'update') {
  if (rows.length === 0) return
  const BATCH = 200
  let done = 0
  const client = await pool.connect()
  try {
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH)
      const values = batch.map((_, j) => `($${j * 2 + 1}, $${j * 2 + 2}::jsonb)`).join(', ')
      const params = batch.flatMap(r => [r.id, JSON.stringify(r.data)])
      const conflict = onConflict === 'update'
        ? `ON CONFLICT (${idCol}) DO UPDATE SET data = EXCLUDED.data`
        : `ON CONFLICT (${idCol}) DO NOTHING`
      await client.query(`INSERT INTO ${table} (${idCol}, data) VALUES ${values} ${conflict}`, params)
      done += batch.length
      process.stdout.write(`\r  ${table}: ${done}/${rows.length}`)
    }
    console.log(`\r  ${table}: ${done}/${rows.length} ✓`)
  } finally {
    client.release()
  }
}

async function setMeta(key, value) {
  await pool.query(
    'INSERT INTO app_meta (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2',
    [key, value]
  )
}

// ─── Seed config ──────────────────────────────────────────────────────────────
const config = loadJSON('config.json')
if (config) {
  await pool.query(
    `INSERT INTO app_config (id, data) VALUES (1, $1::jsonb)
     ON CONFLICT (id) DO UPDATE SET data = $1::jsonb`,
    [JSON.stringify(config)]
  )
  console.log('[seed] ✓ config')
}

// ─── Seed feedback items ──────────────────────────────────────────────────────
const feedback = loadJSON('feedback.json')
if (feedback) {
  await batchUpsert('feedback_items', 'id', feedback.items.map(item => ({ id: item.id, data: item })))
  await setMeta('last_analyzed_at', feedback.lastAnalyzedAt)
  console.log(`[seed] ✓ ${feedback.items.length} feedback items`)
}

// ─── Seed Avoma ───────────────────────────────────────────────────────────────
const avoma = loadJSON('avoma-raw.json')
if (avoma) {
  console.log(`[seed] Uploading ${avoma.meetings.length} meetings, ${avoma.transcripts.length} transcripts...`)
  await batchUpsert('avoma_meetings', 'uuid', avoma.meetings.map(m => ({ id: m.uuid, data: m })), 'nothing')
  await batchUpsert('avoma_transcripts', 'meeting_uuid', avoma.transcripts.map(t => ({ id: t.meetingUuid, data: t })), 'nothing')
  await setMeta('avoma_fetched_at', avoma.fetchedAt)
  console.log('[seed] ✓ Avoma data')
}

// ─── Seed Front ───────────────────────────────────────────────────────────────
const front = loadJSON('front-raw.json')
if (front) {
  console.log(`[seed] Uploading ${front.conversations.length} conversations, ${front.messages.length} messages...`)
  await batchUpsert('front_conversations', 'id', front.conversations.map(c => ({ id: c.id, data: c })), 'nothing')
  await batchUpsert('front_messages', 'id', front.messages.map(m => ({ id: m.id, data: m })), 'nothing')
  await setMeta('front_fetched_at', front.fetchedAt)
  console.log('[seed] ✓ Front data')
}

// ─── Seed Slack ───────────────────────────────────────────────────────────────
const slack = loadJSON('slack-raw.json')
if (slack && slack.channels?.length > 0) {
  for (const ch of slack.channels) {
    await pool.query(
      'INSERT INTO slack_channels (id, name) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET name = $2',
      [ch.id, ch.name]
    )
  }
  if (slack.messages?.length > 0) {
    const client = await pool.connect()
    try {
      const BATCH = 200
      let done = 0
      for (let i = 0; i < slack.messages.length; i += BATCH) {
        const batch = slack.messages.slice(i, i + BATCH)
        const vals = batch.map((_, j) => `($${j*3+1}, $${j*3+2}, $${j*3+3}::jsonb)`).join(', ')
        const params = batch.flatMap(m => [m.ts, m.channel, JSON.stringify(m)])
        await client.query(
          `INSERT INTO slack_messages (ts, channel, data) VALUES ${vals} ON CONFLICT (ts, channel) DO NOTHING`,
          params
        )
        done += batch.length
      }
      console.log(`[seed] ✓ ${done} slack messages`)
    } finally {
      client.release()
    }
  }
  await setMeta('slack_fetched_at', slack.fetchedAt)
}

await pool.end()
console.log('\n[seed] All done! Neon is seeded with your local data.')
