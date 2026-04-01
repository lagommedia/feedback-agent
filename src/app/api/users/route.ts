import { NextRequest, NextResponse } from 'next/server'
import { getUsers, createUser } from '@/lib/storage'

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
    const { email, password } = await req.json()
    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 })
    }
    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 })
    }
    await createUser(email, password)
    return NextResponse.json({ ok: true })
  } catch (err) {
    const msg = String(err)
    if (msg.includes('duplicate') || msg.includes('unique')) {
      return NextResponse.json({ error: 'A user with that email already exists.' }, { status: 409 })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
