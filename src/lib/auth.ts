// Uses Web Crypto API (works in both Edge Runtime and Node.js)

const SECRET = process.env.AUTH_SECRET ?? 'zeni-feedback-secret-key-2026'
export const COOKIE_NAME = 'zf_session'
export const COOKIE_MAX_AGE = 60 * 60 * 24 * 7 // 7 days

// Hardcoded credentials — can be extended to support multiple users later
const USERS: Record<string, string> = {
  'ben@zeni.ai': '$Zeni1234!',
}

export function validateCredentials(email: string, password: string): boolean {
  const stored = USERS[email.toLowerCase()]
  if (!stored) return false
  return stored === password
}

// ─── Web Crypto helpers ───────────────────────────────────────────────────────

async function getHmacKey(): Promise<CryptoKey> {
  const keyData = new TextEncoder().encode(SECRET)
  return crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ])
}

function toBase64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let b = ''
  for (const byte of arr) b += String.fromCharCode(byte)
  return btoa(b).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function fromBase64url(str: string): Uint8Array {
  const pad = (4 - (str.length % 4)) % 4
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(pad)
  const raw = atob(b64)
  return new Uint8Array([...raw].map((c) => c.charCodeAt(0)))
}

// ─── Token helpers (async, Edge-compatible) ────────────────────────────────────

export async function createSessionToken(email: string): Promise<string> {
  const payload = `${email}:${Date.now()}`
  const payloadBytes = new TextEncoder().encode(payload)
  const key = await getHmacKey()
  const sig = await crypto.subtle.sign('HMAC', key, payloadBytes)
  return `${toBase64url(payloadBytes)}.${toBase64url(sig)}`
}

export async function verifySessionToken(token: string): Promise<string | null> {
  try {
    const dot = token.indexOf('.')
    if (dot === -1) return null
    const payloadB64 = token.slice(0, dot)
    const sigB64 = token.slice(dot + 1)
    const payloadBytes = fromBase64url(payloadB64)
    const sigBytes = fromBase64url(sigB64)
    const key = await getHmacKey()
    const valid = await crypto.subtle.verify('HMAC', key, sigBytes.buffer as ArrayBuffer, payloadBytes.buffer as ArrayBuffer)
    if (!valid) return null
    const payload = new TextDecoder().decode(payloadBytes)
    return payload.split(':')[0]
  } catch {
    return null
  }
}
