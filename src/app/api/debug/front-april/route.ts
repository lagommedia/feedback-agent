import { NextResponse } from 'next/server'
import { Pool } from 'pg'

export async function GET() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  })

  const aprilEpoch = Math.floor(new Date('2026-04-01').getTime() / 1000)

  const [createdInApril, updatedInApril, messagesInApril, sampleConvos, sampleMessages] = await Promise.all([
    // Conversations CREATED in April
    pool.query(
      `SELECT COUNT(*) FROM front_conversations WHERE (data->>'created_at')::float >= $1`,
      [aprilEpoch]
    ),
    // Conversations UPDATED in April (but possibly created earlier)
    pool.query(
      `SELECT COUNT(*) FROM front_conversations WHERE (data->>'updated_at')::float >= $1`,
      [aprilEpoch]
    ),
    // Messages created in April
    pool.query(
      `SELECT COUNT(*) FROM front_messages WHERE (data->>'created_at')::float >= $1`,
      [aprilEpoch]
    ),
    // Sample of April-updated conversations
    pool.query(
      `SELECT id, data->>'subject' as subject, data->>'created_at' as created_at, data->>'updated_at' as updated_at, data->>'status' as status
       FROM front_conversations
       WHERE (data->>'updated_at')::float >= $1
       ORDER BY (data->>'updated_at')::float DESC
       LIMIT 10`,
      [aprilEpoch]
    ),
    // Sample of April messages - are they inbound?
    pool.query(
      `SELECT data->>'conversationId' as conv_id, data->>'is_inbound' as is_inbound,
              data->>'created_at' as created_at, LEFT(data->>'text', 100) as text_preview
       FROM front_messages
       WHERE (data->>'created_at')::float >= $1
       ORDER BY (data->>'created_at')::float DESC
       LIMIT 10`,
      [aprilEpoch]
    ),
  ])

  await pool.end()

  return NextResponse.json({
    counts: {
      createdInApril: parseInt(createdInApril.rows[0].count),
      updatedInApril: parseInt(updatedInApril.rows[0].count),
      messagesInApril: parseInt(messagesInApril.rows[0].count),
    },
    sampleConversations: sampleConvos.rows.map(r => ({
      ...r,
      created_at: new Date(parseFloat(r.created_at) * 1000).toISOString().split('T')[0],
      updated_at: new Date(parseFloat(r.updated_at) * 1000).toISOString().split('T')[0],
    })),
    sampleMessages: sampleMessages.rows.map(r => ({
      ...r,
      created_at: new Date(parseFloat(r.created_at) * 1000).toISOString().split('T')[0],
    })),
  })
}
