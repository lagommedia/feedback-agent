import { NextResponse } from 'next/server'
import { Pool } from 'pg'

export async function GET() {
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: 'No DB' }, { status: 500 })
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })

  const [channels, msgCounts, recentMsg] = await Promise.all([
    pool.query('SELECT id, name FROM slack_channels ORDER BY name'),
    pool.query(`
      SELECT channel, COUNT(*) as count,
             MAX((data->>'ts')::float) as latest_ts
      FROM slack_messages
      GROUP BY channel
      ORDER BY channel
    `),
    pool.query(`
      SELECT DISTINCT ON (channel) channel,
             data->>'ts' as ts,
             LEFT(data->>'text', 80) as preview
      FROM slack_messages
      ORDER BY channel, (data->>'ts')::float DESC
    `),
  ])

  await pool.end()

  const channelMap = Object.fromEntries(channels.rows.map((r: {id: string; name: string}) => [r.id, r.name]))
  const countMap = Object.fromEntries(msgCounts.rows.map((r: {channel: string; count: string; latest_ts: string}) => [r.channel, { count: parseInt(r.count), latestDate: r.latest_ts ? new Date(parseFloat(r.latest_ts) * 1000).toISOString().split('T')[0] : null }]))
  const recentMap = Object.fromEntries(recentMsg.rows.map((r: {channel: string; ts: string; preview: string}) => [r.channel, r.preview]))

  return NextResponse.json({
    channels: channels.rows.map((r: {id: string; name: string}) => ({
      id: r.id,
      name: r.name,
      messageCount: countMap[r.id]?.count ?? 0,
      latestMessage: countMap[r.id]?.latestDate ?? null,
      recentPreview: recentMap[r.id] ?? null,
    })),
    configuredIds: ['C05JVBGRYCQ', 'C03V288NLMD', 'C060BB4JU4Q', 'C04UHK8L676'],
  })
}
