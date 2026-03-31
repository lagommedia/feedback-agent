import { createHmac, timingSafeEqual } from 'crypto'

const SECRET = process.env.AUTH_SECRET ?? 'zeni-feedback-secret-key-2026'
const COOKIE_NAME = 'zf_session'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7 // 7 days

// Hardcoded credentials — can be extended to support multiple users later
const USERS: Record<string, string> = {
  'ben@zeni.ai': '$Zeni1234!',
}

export function validateCredentials(email: string, password: string): boolean {
  const stored = USERS[email.toLowerCase()]
  if (!stored) return false
  try {
    return timingSafeEqual(Buffer.from(stored), Buffer.from(password))
  } catch {
    return false
  }
}

export function createSessionToken(email: string): string {
  const payload = `${email}:${Date.now()}`
  const sig = createHmac('sha256', SECRET).update(payload).digest('hex')
  return Buffer.from(`${payload}:${sig}`).toString('base64url')
}

export function verifySessionToken(token: string): string | null {
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf8')
    const lastColon = decoded.lastIndexOf(':')
    const payload = decoded.slice(0, lastColon)
    const sig = decoded.slice(lastColon + 1)
    const expected = createHmac('sha256', SECRET).update(payload).digest('hex')
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null
    const email = payload.split(':')[0]
    return email
  } catch {
    return null
  }
}

export { COOKIE_NAME, COOKIE_MAX_AGE }
