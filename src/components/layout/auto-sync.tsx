'use client'

import { useEffect, useRef } from 'react'

const CHECK_INTERVAL_MS = 60 * 60 * 1000 // re-check every hour
const SYNC_THRESHOLD_MS = 24 * 60 * 60 * 1000 // trigger if > 24h since last sync

const SOURCES = [
  { key: 'avoma', credField: 'apiKey' },
  { key: 'front', credField: 'bearerToken' },
  { key: 'slack', credField: 'botToken' },
] as const

export function AutoSync() {
  const running = useRef(false)

  async function runIfNeeded() {
    if (running.current) return
    running.current = true
    try {
      const res = await fetch('/api/integrations/config')
      if (!res.ok) return
      const { config } = await res.json()
      const now = Date.now()

      let synced = false
      for (const { key, credField } of SOURCES) {
        const cfg = config[key] as Record<string, string> | undefined
        if (!cfg?.[credField]) continue // not configured
        const lastSync = cfg.lastSyncedAt ? new Date(cfg.lastSyncedAt).getTime() : 0
        if (now - lastSync < SYNC_THRESHOLD_MS) continue // synced recently

        try {
          await fetch(`/api/integrations/${key}/sync`, { method: 'POST' })
          synced = true
        } catch {
          // silent fail — don't block other sources
        }
      }

      if (synced) {
        await fetch('/api/analyze', { method: 'POST' }).catch(() => {})
      }
    } finally {
      running.current = false
    }
  }

  useEffect(() => {
    runIfNeeded()
    const interval = setInterval(runIfNeeded, CHECK_INTERVAL_MS)
    return () => clearInterval(interval)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return null
}
