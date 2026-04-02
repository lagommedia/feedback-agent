import { NextRequest, NextResponse } from 'next/server'
import { verifySessionToken, COOKIE_NAME } from '@/lib/auth'
import { getUserPermissions, ALL_PERMISSIONS } from '@/lib/storage'

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value
  const email = token ? await verifySessionToken(token) : null
  if (!email) return NextResponse.json({ email: null, permissions: [] })
  const permissions = await getUserPermissions(email).catch(() => [...ALL_PERMISSIONS])
  return NextResponse.json({ email, permissions })
}
