'use client'

import { Button } from '@/components/ui/button'
import { RefreshCw, Loader2 } from 'lucide-react'
import { useSyncContext } from '@/components/layout/sync-context'

export function SyncAllButton() {
  const { states, syncAll } = useSyncContext()

  const loading = Object.values(states).some(s => s.syncing || s.analyzing)

  return (
    <Button onClick={syncAll} disabled={loading} variant="outline">
      {loading ? (
        <>
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          Syncing...
        </>
      ) : (
        <>
          <RefreshCw className="w-4 h-4 mr-2" />
          Sync All
        </>
      )}
    </Button>
  )
}
