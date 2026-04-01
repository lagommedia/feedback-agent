import { NextRequest, NextResponse } from 'next/server'
import { deleteUser, updateUserPassword } from '@/lib/storage'

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ email: string }> }) {
  try {
    const { email } = await params
    await deleteUser(decodeURIComponent(email))
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ email: string }> }) {
  try {
    const { email } = await params
    const { password } = await req.json()
    if (!password || password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 })
    }
    await updateUserPassword(decodeURIComponent(email), password)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
