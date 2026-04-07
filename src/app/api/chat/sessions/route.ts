import { NextRequest, NextResponse } from 'next/server'
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth'
import { createChatSession, getChatSessions } from '@/lib/storage'
import { v4 as uuidv4 } from 'uuid'

async function getCallerEmail(req: NextRequest): Promise<string | null> {
  const token = req.cookies.get(COOKIE_NAME)?.value
  return token ? await verifySessionToken(token) : null
}

// GET /api/chat/sessions — list all sessions for the current user
export async function GET(req: NextRequest) {
  const email = await getCallerEmail(req)
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sessions = await getChatSessions(email)
  return NextResponse.json(sessions)
}

// POST /api/chat/sessions — create a new session
export async function POST(req: NextRequest) {
  const email = await getCallerEmail(req)
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const id = uuidv4()
  const title = body.title ?? 'New Chat'
  const session = await createChatSession(id, email, title)
  return NextResponse.json(session)
}
