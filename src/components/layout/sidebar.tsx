'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useState, useRef, useEffect, Suspense } from 'react'
import {
  BarChart3,
  Link2,
  List,
  MessageSquare,
  FileText,
  ChevronDown,
  Check,
  LogOut,
  Users,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSyncContext } from '@/components/layout/sync-context'
import type { AppType } from '@/types'
import { APP_TYPES } from '@/types'

const navItems = [
  { href: '/', label: 'Dashboard', icon: BarChart3 },
  { href: '/integrations', label: 'Integrations', icon: Link2 },
  { href: '/feedback', label: 'Feedback Items', icon: List },
  { href: '/chat', label: 'AI Chat', icon: MessageSquare },
  { href: '/reports', label: 'Reports', icon: FileText },
  { href: '/users', label: 'Users', icon: Users },
]

const APP_OPTIONS: Array<{ value: AppType | 'all'; label: string }> = [
  { value: 'all', label: 'All Feedback' },
  { value: 'product', label: 'Product Feedback' },
  { value: 'service', label: 'Service Feedback' },
  { value: 'churn_risk', label: 'Churn Risk' },
]

export function Sidebar() {
  return (
    <Suspense fallback={<SidebarShell />}>
      <SidebarInner />
    </Suspense>
  )
}

function SidebarShell() {
  return (
    <aside className="fixed left-0 top-0 h-screen w-60 bg-background border-r border-border flex flex-col z-30">
      <div className="px-6 py-5 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
            <BarChart3 className="w-4 h-4 text-primary-foreground" />
          </div>
          <div>
            <p className="font-semibold text-sm leading-tight tracking-tight">All Feedback</p>
            <p className="text-xs text-muted-foreground leading-tight">Zeni AI</p>
          </div>
        </div>
      </div>
    </aside>
  )
}

function SidebarInner() {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { states, anthropicConfigured } = useSyncContext()
  const [open, setOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [myAssignedCount, setMyAssignedCount] = useState(0)

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(({ email }) => {
        if (!email) return
        return fetch(`/api/feedback?assignedTo=${encodeURIComponent(email)}&limit=0`)
          .then(r => r.json())
          .then(d => setMyAssignedCount(d.total ?? 0))
      })
      .catch(() => {})
  }, [])

  const currentApp = (searchParams.get('app') as AppType | 'all') ?? 'all'
  const currentAppLabel = APP_OPTIONS.find((o) => o.value === currentApp)?.label ?? 'All Feedback'

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function selectApp(value: AppType | 'all') {
    setOpen(false)
    // Navigate to current page with updated app param
    const params = new URLSearchParams(searchParams.toString())
    if (value === 'all') {
      params.delete('app')
    } else {
      params.set('app', value)
    }
    // Preserve path but reset other filters except app
    const basePath = pathname === '/' ? '/' : pathname
    const qs = params.toString()
    router.push(qs ? `${basePath}?${qs}` : basePath)
  }

  function navHref(href: string) {
    if (currentApp === 'all') return href
    return `${href}${href === '/' ? '?' : '?'}app=${currentApp}`
  }

  const connectionStatus = {
    avoma: states.avoma.configured,
    front: states.front.configured,
    slack: states.slack.configured,
    anthropic: anthropicConfigured,
  }

  const isSyncing = Object.values(states).some(s => s.syncing || s.analyzing)
  const connectedCount = Object.values(connectionStatus).filter(Boolean).length

  return (
    <aside className="fixed left-0 top-0 h-screen w-60 bg-background border-r border-border flex flex-col z-30">
      {/* App switcher */}
      <div className="px-4 py-5 border-b border-border relative" ref={dropdownRef}>
        <button
          onClick={() => setOpen((o) => !o)}
          className="w-full flex items-center gap-2.5 group"
        >
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
            <BarChart3 className="w-4 h-4 text-primary-foreground" />
          </div>
          <div className="flex-1 text-left min-w-0">
            <p className="font-semibold text-sm leading-tight tracking-tight truncate">{currentAppLabel}</p>
            <p className="text-xs text-muted-foreground leading-tight">Zeni AI</p>
          </div>
          <ChevronDown className={cn(
            'w-4 h-4 text-muted-foreground shrink-0 transition-transform duration-150',
            open && 'rotate-180'
          )} />
        </button>

        {open && (
          <div className="absolute left-3 right-3 top-full mt-1 bg-popover border border-border rounded-lg shadow-lg z-50 py-1 overflow-hidden">
            {APP_OPTIONS.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => selectApp(value)}
                className={cn(
                  'w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors text-left',
                  value === currentApp
                    ? 'text-foreground bg-muted/60'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
                )}
              >
                <Check className={cn(
                  'w-3.5 h-3.5 shrink-0',
                  value === currentApp ? 'opacity-100' : 'opacity-0'
                )} />
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href)
          const showSyncDot = href === '/integrations' && isSyncing
          return (
            <Link
              key={href}
              href={navHref(href)}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-all duration-150',
                isActive
                  ? 'text-primary font-medium bg-primary/10'
                  : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.04]'
              )}
            >
              <Icon className={cn('w-4 h-4 shrink-0', isActive ? 'text-primary' : '')} />
              <span className="flex-1">{label}</span>
              {showSyncDot && (
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse shrink-0" />
              )}
              {href === '/feedback' && myAssignedCount > 0 && (
                <span className="flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-primary text-primary-foreground text-[10px] font-bold px-1 shrink-0">
                  {myAssignedCount}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      {/* Integration status footer */}
      <div className="px-4 py-4 border-t border-border">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-muted-foreground">Integrations</p>
          {isSyncing && (
            <span className="text-xs text-primary animate-pulse">Syncing…</span>
          )}
        </div>
        <div className="space-y-1.5">
          {[
            { key: 'avoma', label: 'Avoma' },
            { key: 'front', label: 'Front' },
            { key: 'slack', label: 'Slack' },
            { key: 'anthropic', label: 'Anthropic AI' },
          ].map(({ key, label }) => {
            const src = key as keyof typeof connectionStatus
            const syncing = key !== 'anthropic' &&
              (states[key as keyof typeof states]?.syncing || states[key as keyof typeof states]?.analyzing)
            return (
              <div key={key} className="flex items-center gap-2">
                <div className={cn(
                  'w-1.5 h-1.5 rounded-full shrink-0',
                  syncing ? 'bg-primary animate-pulse' : connectionStatus[src] ? 'bg-primary' : 'bg-muted-foreground/40'
                )} />
                <span className="text-xs text-muted-foreground flex-1">{label}</span>
                {syncing && (
                  <span className="text-xs text-primary/70">
                    {states[key as keyof typeof states]?.analyzing ? 'analyzing' : 'syncing'}
                  </span>
                )}
              </div>
            )
          })}
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          {connectedCount}/4 connected
        </p>
      </div>

      {/* Sign out */}
      <div className="px-4 pb-4">
        <button
          onClick={async () => {
            await fetch('/api/auth/logout', { method: 'POST' })
            window.location.href = '/login'
          }}
          className="flex items-center gap-2 w-full rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" />
          Sign out
        </button>
      </div>
    </aside>
  )
}
