import { NextRequest, NextResponse } from 'next/server'
import { deleteUser, updateUserPassword, updateUserPermissions, getUserPermissions } from '@/lib/storage'
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth'

async function getCaller(req: NextRequest): Promise<{ email: string | null; permissions: string[] }> {
  const token = req.cookies.get(COOKIE_NAME)?.value
  const email = token ? await verifySessionToken(token) : null
  if (!email) return { email: null, permissions: [] }
  const permissions = await getUserPermissions(email)
  return { email, permissions }
}

const PROTECTED_ACCOUNTS = ['ben@zeni.ai']

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ email: string }> }) {
  try {
    const caller = await getCaller(req)
    if (!caller.permissions.includes('users')) {
      return NextResponse.json({ error: 'You do not have permission to delete users.' }, { status: 403 })
    }
    const { email } = await params
    const targetEmail = decodeURIComponent(email).toLowerCase()
    if (PROTECTED_ACCOUNTS.includes(targetEmail)) {
      return NextResponse.json({ error: 'This account cannot be deleted.' }, { status: 403 })
    }
    await deleteUser(targetEmail)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ email: string }> }) {
  try {
    const caller = await getCaller(req)
    if (!caller.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { email } = await params
    const targetEmail = decodeURIComponent(email).toLowerCase()
    const body = await req.json()

    if (body.permissions !== undefined) {
      // Updating permissions — requires 'users' permission
      if (!caller.permissions.includes('users')) {
        return NextResponse.json({ error: 'You do not have permission to edit user permissions.' }, { status: 403 })
      }
      if (!Array.isArray(body.permissions)) {
        return NextResponse.json({ error: 'permissions must be an array.' }, { status: 400 })
      }
      await updateUserPermissions(targetEmail, body.permissions)
      return NextResponse.json({ ok: true })
    }

    // Updating password — must be an admin (has 'users' perm) or changing your own password
    const callerEmail = caller.email.toLowerCase()
    const isAdmin = caller.permissions.includes('users')
    const isSelf = callerEmail === targetEmail

    if (!isAdmin && !isSelf) {
      return NextResponse.json({ error: 'You can only change your own password.' }, { status: 403 })
    }

    const { password } = body
    if (!password || password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 })
    }
    await updateUserPassword(targetEmail, password)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
