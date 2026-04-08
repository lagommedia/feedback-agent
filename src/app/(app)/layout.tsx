import { SyncProvider } from '@/components/layout/sync-context'
import { Sidebar } from '@/components/layout/sidebar'
import { AutoSync } from '@/components/layout/auto-sync'
import { Toaster } from '@/components/ui/sonner'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SyncProvider>
      <Sidebar />
      <main className="ml-60 h-screen overflow-y-auto">
        {children}
      </main>
      <Toaster />
      <AutoSync />
    </SyncProvider>
  )
}
