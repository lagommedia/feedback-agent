import { NextRequest, NextResponse } from 'next/server'
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth'
import {
  getChatMessages,
  deleteChatSession,
  updateChatSessionTitle,
  getChatSessions,
} from '@/lib/storage'

async function getCallerEmail(req: NextRequest): Promise<string | null> {
  const token = req.cookies.get(COOKIE_NAME)?.value
  return token ? await verifySessionToken(token) : null
}

// GET /api/chat/sessions/[id] — get messages for a session
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const email = await getCallerEmail(req)
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  // Verify the session belongs to this user
  const sessions = await getChatSessions(email)
  if (!sessions.find((s) => s.id === id)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const messages = await getChatMessages(id)
  return NextResponse.json(messages)
}

// PATCH /api/chat/sessions/[id] — rename a session
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const email = await getCallerEmail(req)
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  if (body.title) {
    await updateChatSessionTitle(id, body.title)
  }
  return NextResponse.json({ ok: true })
}

// DELETE /api/chat/sessions/[id] — delete a session and its messages
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const email = await getCallerEmail(req)
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  // Verify ownership
  const sessions = await getChatSessions(email)
  if (!sessions.find((s) => s.id === id)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  await deleteChatSession(id)
  return NextResponse.json({ ok: true })
}
