import { NextRequest, NextResponse } from 'next/server'
import { validateCredentials, createSessionToken, COOKIE_NAME, COOKIE_MAX_AGE } from '@/lib/auth'

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json()

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 })
    }

    if (!validateCredentials(email, password)) {
      return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 })
    }

    const token = createSessionToken(email)
    const res = NextResponse.json({ ok: true })

    res.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: COOKIE_MAX_AGE,
    })

    return res
  } catch {
    return NextResponse.json({ error: 'Server error.' }, { status: 500 })
  }
}
