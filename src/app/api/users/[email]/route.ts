import { NextRequest, NextResponse } from 'next/server'
import { deleteUser, updateUserPassword, updateUserPermissions, getUserPermissions } from '@/lib/storage'
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth'

async function getCallerPermissions(req: NextRequest): Promise<string[]> {
  const token = req.cookies.get(COOKIE_NAME)?.value
  const email = token ? await verifySessionToken(token) : null
  if (!email) return []
  return getUserPermissions(email)
}

const PROTECTED_ACCOUNTS = ['ben@zeni.ai']

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ email: string }> }) {
  try {
    const callerPerms = await getCallerPermissions(req)
    if (!callerPerms.includes('users')) {
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
    const { email } = await params
    const targetEmail = decodeURIComponent(email)
    const body = await req.json()

    if (body.permissions !== undefined) {
      // Updating permissions — requires 'users' permission
      const callerPerms = await getCallerPermissions(req)
      if (!callerPerms.includes('users')) {
        return NextResponse.json({ error: 'You do not have permission to edit user permissions.' }, { status: 403 })
      }
      if (!Array.isArray(body.permissions)) {
        return NextResponse.json({ error: 'permissions must be an array.' }, { status: 400 })
      }
      await updateUserPermissions(targetEmail, body.permissions)
      return NextResponse.json({ ok: true })
    }

    // Updating password
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
