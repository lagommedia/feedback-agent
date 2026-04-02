import { NextRequest, NextResponse } from 'next/server'
import { getUsers, createUser, getUserPermissions } from '@/lib/storage'
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth'

export async function GET() {
  try {
    const users = await getUsers()
    return NextResponse.json({ users })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    // Verify caller has 'users' permission
    const token = req.cookies.get(COOKIE_NAME)?.value
    const callerEmail = token ? await verifySessionToken(token) : null
    if (!callerEmail) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const callerPerms = await getUserPermissions(callerEmail)
    if (!callerPerms.includes('users')) {
      return NextResponse.json({ error: 'You do not have permission to create users.' }, { status: 403 })
    }

    const { email, password, permissions } = await req.json()
    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 })
    }
    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 })
    }
    await createUser(email, password, permissions ?? undefined)
    return NextResponse.json({ ok: true })
  } catch (err) {
    const msg = String(err)
    if (msg.includes('duplicate') || msg.includes('unique')) {
      return NextResponse.json({ error: 'A user with that email already exists.' }, { status: 409 })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
