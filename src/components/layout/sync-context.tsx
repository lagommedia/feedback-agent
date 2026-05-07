'use client'

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import { toast } from 'sonner'

export type SyncSource = 'avoma' | 'front' | 'slack'

export interface SourceState {
  configured: boolean
  syncing: boolean
  analyzing: boolean
  error?: string
  count?: number
  lastSyncedAt?: string
}

const defaultState: SourceState = { configured: false, syncing: false, analyzing: false }

type AllStates = Record<SyncSource, SourceState>

interface SyncContextValue {
  states: AllStates
  anthropicConfigured: boolean
  refreshConfig: () => Promise<void>
  syncSource: (source: SyncSource) => Promise<void>
  syncAll: () => Promise<void>
}

const SyncContext = createContext<SyncContextValue | null>(null)

export function SyncProvider({ children }: { children: ReactNode }) {
  const [states, setStates] = useState<AllStates>({
    avoma: defaultState,
    front: defaultState,
    slack: defaultState,
  })
  const [anthropicConfigured, setAnthropicConfigured] = useState(false)

  const refreshConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/integrations/config')
      const { config } = await res.json()
      setStates(prev => ({
        avoma: { ...prev.avoma, configured: !!config.avoma?.apiKey, lastSyncedAt: config.avoma?.lastSyncedAt },
        front: { ...prev.front, configured: !!config.front?.bearerToken, lastSyncedAt: config.front?.lastSyncedAt },
        slack: { ...prev.slack, configured: !!config.slack?.botToken, lastSyncedAt: config.slack?.lastSyncedAt },
      }))
      setAnthropicConfigured(!!config.anthropic?.apiKey)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { refreshConfig() }, [refreshConfig])

  // Run /api/analyze in a loop until no unanalyzed items remain.
  // Each call processes ~75 Avoma + ~35 Front transcripts (≈ one Vercel function invocation).
  // Retries up to 3 times with a 30s back-off when the API is overloaded.
  // Returns total new items extracted.
  const runAnalysisLoop = useCallback(async (): Promise<number> => {
    let totalNew = 0
    let iteration = 0
    let consecutiveFailures = 0
    const MAX_ITERATIONS = 60        // safety cap — handles backlogs up to ~6,600 items
    const MAX_CONSECUTIVE_FAILURES = 3

    while (iteration < MAX_ITERATIONS) {
      iteration++
      try {
        const analyzeRes = await fetch('/api/analyze', { method: 'POST' })
        const analyzeData = await analyzeRes.json()
        if (!analyzeRes.ok) throw new Error(analyzeData.error ?? 'Analysis failed')

        consecutiveFailures = 0
        totalNew += analyzeData.newItems ?? 0

        const remaining = (analyzeData.remaining?.avoma ?? 0) + (analyzeData.remaining?.front ?? 0)

        if (remaining > 0) {
          // Show progress so the user knows it's still running
          toast.info(`Analyzing… ${remaining} item${remaining !== 1 ? 's' : ''} remaining`)
        } else {
          break
        }
      } catch (err) {
        consecutiveFailures++
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          throw err
        }
        // Anthropic 529 overloaded errors need a genuine cool-down before retrying.
        const waitSec = consecutiveFailures === 1 ? 60 : 90
        toast.info(`API busy — retrying in ${waitSec}s… (attempt ${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES})`)
        await new Promise((res) => setTimeout(res, waitSec * 1000))
      }
    }

    return totalNew
  }, [])

  const syncSource = useCallback(async (source: SyncSource) => {
    setStates(prev => ({ ...prev, [source]: { ...prev[source], syncing: true, error: undefined } }))
    try {
      const syncRes = await fetch(`/api/integrations/${source}/sync`, { method: 'POST' })
      const syncData = await syncRes.json()
      if (!syncRes.ok || syncData.status === 'error') throw new Error(syncData.error ?? 'Sync failed')

      setStates(prev => ({ ...prev, [source]: { ...prev[source], syncing: false, count: syncData.count, analyzing: true } }))
      toast.success(`${source.charAt(0).toUpperCase() + source.slice(1)}: synced ${syncData.count} records`)

      const totalNew = await runAnalysisLoop()

      setStates(prev => ({ ...prev, [source]: { ...prev[source], analyzing: false, lastSyncedAt: new Date().toISOString() } }))
      toast.success(`Analysis complete: ${totalNew} new feedback item${totalNew !== 1 ? 's' : ''}`)
    } catch (err) {
      setStates(prev => ({ ...prev, [source]: { ...prev[source], syncing: false, analyzing: false, error: String(err) } }))
      toast.error(String(err))
      throw err
    }
  }, [runAnalysisLoop])

  const syncAll = useCallback(async () => {
    const sources: SyncSource[] = ['avoma', 'front', 'slack']
    let syncedAny = false

    for (const source of sources) {
      setStates(prev => ({ ...prev, [source]: { ...prev[source], syncing: true, error: undefined } }))
      try {
        const res = await fetch(`/api/integrations/${source}/sync`, { method: 'POST' })
        const data = await res.json()
        if (res.ok && data.status === 'success') {
          syncedAny = true
          toast.success(`${source.charAt(0).toUpperCase() + source.slice(1)}: synced ${data.count} records`)
          setStates(prev => ({ ...prev, [source]: { ...prev[source], syncing: false, count: data.count } }))
        } else {
          setStates(prev => ({ ...prev, [source]: { ...prev[source], syncing: false } }))
        }
      } catch {
        setStates(prev => ({ ...prev, [source]: { ...prev[source], syncing: false } }))
      }
    }

    if (!syncedAny) {
      toast.info('No integrations synced. Check your configuration.')
      return
    }

    setStates(prev => ({
      avoma: { ...prev.avoma, analyzing: true },
      front: { ...prev.front, analyzing: true },
      slack: { ...prev.slack, analyzing: true },
    }))
    try {
      const totalNew = await runAnalysisLoop()
      const now = new Date().toISOString()
      toast.success(`Analysis complete: ${totalNew} new feedback item${totalNew !== 1 ? 's' : ''}`)
      setStates(prev => ({
        avoma: { ...prev.avoma, analyzing: false, lastSyncedAt: now },
        front: { ...prev.front, analyzing: false, lastSyncedAt: now },
        slack: { ...prev.slack, analyzing: false, lastSyncedAt: now },
      }))
    } catch (err) {
      toast.error(String(err))
      setStates(prev => ({
        avoma: { ...prev.avoma, analyzing: false },
        front: { ...prev.front, analyzing: false },
        slack: { ...prev.slack, analyzing: false },
      }))
    }
  }, [runAnalysisLoop])

  return (
    <SyncContext.Provider value={{ states, anthropicConfigured, refreshConfig, syncSource, syncAll }}>
      {children}
    </SyncContext.Provider>
  )
}

export function useSyncContext() {
  const ctx = useContext(SyncContext)
  if (!ctx) throw new Error('useSyncContext must be used within SyncProvider')
  return ctx
}
