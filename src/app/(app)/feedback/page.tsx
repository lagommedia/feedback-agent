'use client'

import { useState, useEffect, useCallback, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { AlertCircle, ThumbsUp, Lightbulb, ChevronDown, ChevronUp, Search, Loader2, Pencil, Check, X as XIcon, MessageSquarePlus, ExternalLink, UserCircle, Building2 } from 'lucide-react'
import type { FeedbackItem, FeedbackSource, FeedbackType, UrgencyLevel, AppType } from '@/types'
import { PRODUCT_TAGS, SERVICE_TAGS, CHURN_TAGS, TAGS_BY_APP_TYPE, APP_TYPES } from '@/types'
import { FeedbackDrawer } from '@/components/feedback/feedback-drawer'

const SOURCE_LOGOS: Record<string, { logo: string; alt: string }> = {
  avoma: { logo: 'https://www.google.com/s2/favicons?domain=avoma.com&sz=32', alt: 'Avoma' },
  front: { logo: 'https://www.google.com/s2/favicons?domain=front.com&sz=32', alt: 'Front' },
  slack: { logo: 'https://www.google.com/s2/favicons?domain=slack.com&sz=32', alt: 'Slack' },
}

function buildSourceUrl(item: FeedbackItem): string | null {
  if (item.source === 'avoma') return `https://app.avoma.com/meetings/${item.rawSourceId}`
  if (item.source === 'front') return `https://app.frontapp.com/open/${item.rawSourceId}`
  if (item.source === 'slack') {
    const parts = item.rawSourceId.replace('slack-', '').split('-')
    if (parts.length >= 2) {
      const channelId = parts[0]
      const ts = parts.slice(1).join('-').replace('.', '')
      return `https://app.slack.com/client/${channelId}/p${ts}`
    }
  }
  return null
}

// Color map for app types
const APP_TYPE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  product:    { bg: 'rgba(99,102,241,0.12)',  text: '#818cf8', border: 'rgba(99,102,241,0.3)'  },
  service:    { bg: 'rgba(20,184,166,0.12)',  text: '#2dd4bf', border: 'rgba(20,184,166,0.3)'  },
  churn_risk: { bg: 'rgba(239,68,68,0.12)',   text: '#f87171', border: 'rgba(239,68,68,0.3)'   },
}

const APP_TYPE_LABELS: Record<string, string> = {
  product:    'Product',
  service:    'Service',
  churn_risk: 'Churn Risk',
}

function AppTypeBadge({ appType }: { appType?: string }) {
  const key = appType ?? 'product'
  const colors = APP_TYPE_COLORS[key] ?? APP_TYPE_COLORS.product
  const label = APP_TYPE_LABELS[key] ?? 'Product'
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap border"
      style={{ background: colors.bg, color: colors.text, borderColor: colors.border }}
    >
      {label}
    </span>
  )
}

// Color map for all tags across product, service, and churn categories
const TAG_COLORS: Record<string, { bg: string; text: string }> = {
  // Product
  'Dashboard':        { bg: 'rgba(123,97,255,0.15)',  text: '#9B7FFF' },
  'Reports':          { bg: 'rgba(0,150,255,0.15)',   text: '#4BAAFF' },
  'Bill Pay':         { bg: 'rgba(255,184,0,0.15)',   text: '#FFB800' },
  'Reimbursements':   { bg: 'rgba(255,80,0,0.15)',    text: '#FF7040' },
  'Checking / Debit': { bg: 'rgba(0,200,210,0.15)',   text: '#00C8D2' },
  'Credit Cards':     { bg: 'rgba(180,100,255,0.15)', text: '#C47FFF' },
  'Treasury':         { bg: 'rgba(0,200,5,0.15)',     text: '#00C805' },
  'Integrations':     { bg: 'rgba(255,100,130,0.15)', text: '#FF6482' },
  'AI CFO':           { bg: 'rgba(0,212,255,0.15)',   text: '#00D4FF' },
  // Service
  'Onboarding':            { bg: 'rgba(20,184,166,0.15)',  text: '#2dd4bf' },
  'Account Management':    { bg: 'rgba(16,185,129,0.15)',  text: '#34d399' },
  'Bookkeeping Accuracy':  { bg: 'rgba(6,182,212,0.15)',   text: '#22d3ee' },
  'Month-End Close':       { bg: 'rgba(14,165,233,0.15)',  text: '#38bdf8' },
  'Tax Preparation':       { bg: 'rgba(99,102,241,0.15)',  text: '#818cf8' },
  'Response Time':         { bg: 'rgba(139,92,246,0.15)',  text: '#a78bfa' },
  'Communication':         { bg: 'rgba(168,85,247,0.15)',  text: '#c084fc' },
  'Escalation Handling':   { bg: 'rgba(236,72,153,0.15)',  text: '#f472b6' },
  'Training & Enablement': { bg: 'rgba(20,184,166,0.12)',  text: '#5eead4' },
  'Billing & Invoicing':   { bg: 'rgba(251,191,36,0.15)',  text: '#fbbf24' },
  // Churn Risk
  'Pricing / Cost':            { bg: 'rgba(239,68,68,0.15)',   text: '#f87171' },
  'Missing Features':          { bg: 'rgba(249,115,22,0.15)',  text: '#fb923c' },
  'Competitor Mention':        { bg: 'rgba(234,88,12,0.15)',   text: '#f97316' },
  'Bookkeeping Errors':        { bg: 'rgba(220,38,38,0.15)',   text: '#ef4444' },
  'Slow Response':             { bg: 'rgba(245,158,11,0.15)',  text: '#f59e0b' },
  'Lack of Value':             { bg: 'rgba(239,68,68,0.12)',   text: '#fca5a5' },
  'Leadership / Team Change':  { bg: 'rgba(190,18,60,0.15)',   text: '#fb7185' },
  'Contract / Renewal Risk':   { bg: 'rgba(159,18,57,0.15)',   text: '#f43f5e' },
  'Support Dissatisfaction':   { bg: 'rgba(220,38,38,0.12)',   text: '#fca5a5' },
  'Switching Intent':          { bg: 'rgba(127,29,29,0.25)',   text: '#fca5a5' },
}

function TagBadge({ tag }: { tag: string }) {
  const colors = TAG_COLORS[tag] ?? { bg: 'rgba(100,100,100,0.15)', text: '#aaa' }
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium whitespace-nowrap"
      style={{ background: colors.bg, color: colors.text }}
    >
      {tag}
    </span>
  )
}

function urgencyColor(urgency: UrgencyLevel): 'destructive' | 'secondary' | 'outline' {
  return urgency === 'high' ? 'destructive' : urgency === 'medium' ? 'secondary' : 'outline'
}

function typeIcon(type: FeedbackType) {
  if (type === 'issue') return <AlertCircle className="w-3.5 h-3.5" style={{ color: '#FF5000' }} />
  if (type === 'praise') return <ThumbsUp className="w-3.5 h-3.5" style={{ color: '#00C805' }} />
  return <Lightbulb className="w-3.5 h-3.5" style={{ color: '#FFB800' }} />
}

function typeLabel(type: FeedbackType) {
  return type === 'feature_request' ? 'Feature Request' : type.charAt(0).toUpperCase() + type.slice(1)
}

function sourceLabel(source: FeedbackSource) {
  return source === 'avoma' ? 'Avoma' : source === 'front' ? 'Front' : 'Slack'
}

function AssigneeSelector({
  assignedTo,
  users,
  onAssign,
}: {
  assignedTo?: string
  users: { email: string }[]
  onAssign: (email: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const filtered = users.filter((u) =>
    u.email.toLowerCase().includes(query.replace(/^@/, '').toLowerCase())
  )

  useEffect(() => {
    if (open) {
      setQuery('')
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open])

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function select(email: string) {
    onAssign(email)
    setOpen(false)
  }

  return (
    <div ref={containerRef} className="relative flex items-center gap-2">
      <UserCircle className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
      <span className="text-xs text-muted-foreground">Assigned to</span>

      {assignedTo && !open ? (
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); setOpen(true) }}
            className="flex items-center gap-1.5 rounded-full bg-primary/15 text-primary text-xs font-medium px-2.5 py-0.5 hover:bg-primary/25 transition-colors"
          >
            <span className="w-4 h-4 rounded-full bg-primary/30 flex items-center justify-center text-[9px] font-bold shrink-0">
              {assignedTo.slice(0, 2).toUpperCase()}
            </span>
            {assignedTo}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onAssign('') }}
            className="text-muted-foreground hover:text-foreground transition-colors"
            title="Unassign"
          >
            <XIcon className="w-3 h-3" />
          </button>
        </div>
      ) : open ? (
        <div className="flex flex-col">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false) }}
            placeholder="@name or email..."
            className="h-6 w-48 rounded-md border border-primary/50 bg-background px-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
          {filtered.length > 0 && (
            <div className="absolute top-full left-6 mt-1 w-56 bg-popover border border-border rounded-lg shadow-lg z-50 py-1 overflow-hidden">
              {filtered.map((u) => (
                <button
                  key={u.email}
                  onClick={(e) => { e.stopPropagation(); select(u.email) }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-muted/60 transition-colors"
                >
                  <span className="w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center text-[9px] font-bold shrink-0">
                    {u.email.slice(0, 2).toUpperCase()}
                  </span>
                  {u.email}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <button
          onClick={(e) => { e.stopPropagation(); setOpen(true) }}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          + Assign
        </button>
      )}
    </div>
  )
}

function CompanyFilter({
  value,
  options,
  onChange,
}: {
  value: string
  options: string[]
  onChange: (v: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const filtered = options.filter((c) =>
    c.toLowerCase().includes(query.toLowerCase())
  ).slice(0, 50)

  useEffect(() => {
    if (open) {
      setQuery('')
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open])

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={containerRef} className="flex flex-col gap-1 relative">
      <span className="text-xs text-muted-foreground font-medium px-0.5">Company</span>
      {value && !open ? (
        <div className="flex items-center gap-1 h-9">
          <button
            onClick={() => setOpen(true)}
            className="flex items-center gap-1.5 rounded-full bg-primary/15 text-primary text-xs font-medium px-2.5 py-1 hover:bg-primary/25 transition-colors max-w-[160px]"
          >
            <Building2 className="w-3 h-3 shrink-0" />
            <span className="truncate">{value}</span>
          </button>
          <button
            onClick={() => onChange('')}
            className="text-muted-foreground hover:text-foreground transition-colors"
            title="Clear company filter"
          >
            <XIcon className="w-3 h-3" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <Building2 className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search company…"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
            onFocus={() => setOpen(true)}
            className="h-9 w-44 pl-8 pr-3 rounded-md border border-input bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          {open && (
            <div className="absolute top-full mt-1 left-0 w-56 bg-popover border border-border rounded-lg shadow-lg z-50 py-1 max-h-56 overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="px-3 py-2 text-xs text-muted-foreground">No companies found</p>
              ) : (
                filtered.map((c) => (
                  <button
                    key={c}
                    onClick={() => { onChange(c); setOpen(false) }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-muted/50 transition-colors"
                  >
                    <Building2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="truncate">{c}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function FeedbackPage() {
  return (
    <Suspense fallback={<div className="p-8 text-muted-foreground text-sm">Loading...</div>}>
      <FeedbackList />
    </Suspense>
  )
}

function FeedbackList() {
  const searchParams = useSearchParams()

  const idParam = searchParams.get('id')
  const fromParam = searchParams.get('from')
  const toParam = searchParams.get('to')
  const appParam = searchParams.get('app') as AppType | null
  const isDateView = !!(fromParam || toParam)

  const [items, setItems] = useState<FeedbackItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(idParam)
  const [editing, setEditing] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<{ type: FeedbackType; appType: AppType; customer: string; rep: string; tags: string[] } | null>(null)
  const [saving, setSaving] = useState(false)
  const [trainState, setTrainState] = useState<Record<string, { action: string; notes: string }>>({})
  const [drawerItem, setDrawerItem] = useState<FeedbackItem | null>(null)
  const [currentUser, setCurrentUser] = useState<string | null>(null)
  const [users, setUsers] = useState<{ email: string }[]>([])
  const [assignedToFilter, setAssignedToFilter] = useState<string>('')
  const [companyFilter, setCompanyFilter] = useState<string>('')
  const [allCustomers, setAllCustomers] = useState<string[]>([])

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(d => setCurrentUser(d.email ?? null))
    fetch('/api/users').then(r => r.json()).then(d => setUsers(d.users ?? []))
    fetch('/api/feedback/customers').then(r => r.json()).then(d => setAllCustomers(d.customers ?? []))
  }, [])

  function startEdit(item: FeedbackItem) {
    setEditing(item.id)
    setEditDraft({ type: item.type, appType: item.appType ?? 'product', customer: item.customer, rep: item.rep, tags: item.tags ?? [] })
  }

  function cancelEdit() {
    setEditing(null)
    setEditDraft(null)
  }

  async function submitTraining(item: FeedbackItem) {
    const state = trainState[item.id]
    if (!state?.action || !state?.notes?.trim()) return

    const [action, targetType] = state.action.split(':')

    // Optimistic update — reflect immediately in UI
    if (action === 'remove') {
      setItems((prev) => prev.filter((i) => i.id !== item.id))
      setExpanded(null)
    } else {
      setItems((prev) => prev.map((i) => i.id === item.id ? { ...i, appType: targetType as AppType } : i))
    }
    setTrainState((prev) => { const next = { ...prev }; delete next[item.id]; return next })

    // Persist in background — revert on failure
    try {
      const res = await fetch(`/api/feedback/${item.id}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, targetType, notes: state.notes }),
      })
      if (!res.ok) {
        const data = await res.json()
        // Revert
        if (action === 'remove') {
          setItems((prev) => [item, ...prev])
          setExpanded(item.id)
        } else {
          setItems((prev) => prev.map((i) => i.id === item.id ? item : i))
        }
        alert(data.error ?? 'Failed to apply — change reverted')
      }
    } catch {
      // Revert on network error
      if (action === 'remove') {
        setItems((prev) => [item, ...prev])
        setExpanded(item.id)
      } else {
        setItems((prev) => prev.map((i) => i.id === item.id ? item : i))
      }
      alert('Network error — change reverted')
    }
  }

  async function saveAssignment(id: string, email: string) {
    setItems((prev) => prev.map((i) => i.id === id ? { ...i, assignedTo: email || undefined } : i))
    await fetch('/api/feedback', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, assignedTo: email }),
    })
  }

  async function saveEdit(id: string) {
    if (!editDraft) return
    setSaving(true)
    try {
      const res = await fetch('/api/feedback', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...editDraft }),
      })
      const data = await res.json()
      if (data.item) {
        setItems((prev) => prev.map((i) => (i.id === id ? data.item : i)))
      }
      setEditing(null)
      setEditDraft(null)
    } finally {
      setSaving(false)
    }
  }

  function toggleTag(tag: string) {
    setEditDraft((d) => {
      if (!d) return d
      const has = d.tags.includes(tag)
      return { ...d, tags: has ? d.tags.filter((t) => t !== tag) : [...d.tags, tag] }
    })
  }

  // Filters — initialized from URL search params (hidden when in id/date view)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>(searchParams.get('type') ?? '')
  const [urgencyFilter, setUrgencyFilter] = useState<string>(searchParams.get('urgency') ?? '')
  const [tagFilter, setTagFilter] = useState<string>(searchParams.get('tag') ?? '')

  const fetchItems = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (idParam) {
      params.set('id', idParam)
    } else if (isDateView) {
      if (fromParam) params.set('from', fromParam)
      if (toParam) params.set('to', toParam)
      if (searchParams.get('type')) params.set('type', searchParams.get('type')!)
      if (searchParams.get('urgency')) params.set('urgency', searchParams.get('urgency')!)
      if (searchParams.get('tag')) params.set('tag', searchParams.get('tag')!)
    } else {
      if (typeFilter) params.append('type', typeFilter)
      if (urgencyFilter) params.append('urgency', urgencyFilter)
      if (tagFilter) params.append('tag', tagFilter)
      if (search) params.set('search', search)
      if (assignedToFilter) params.set('assignedTo', assignedToFilter)
      if (companyFilter) params.set('customer', companyFilter)
    }
    if (appParam) params.set('appType', appParam)
    params.set('limit', '100')

    try {
      const res = await fetch(`/api/feedback?${params}`)
      const data = await res.json()
      setItems(data.items ?? [])
      setTotal(data.total ?? 0)
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [idParam, isDateView, fromParam, toParam, search, typeFilter, urgencyFilter, tagFilter, assignedToFilter, companyFilter, appParam, searchParams])

  useEffect(() => {
    const t = setTimeout(fetchItems, 200)
    return () => clearTimeout(t)
  }, [fetchItems])

  const hasFilters = !!(typeFilter || urgencyFilter || tagFilter || search || assignedToFilter || companyFilter)

  return (
    <div className="p-8">
      <div className="mb-6">
        <div className="flex items-center gap-3">
          {(idParam || isDateView) && (
            <Link href={`/feedback${appParam ? `?app=${appParam}` : ''}`} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              ← All feedback
            </Link>
          )}
          <h1 className="text-2xl font-bold">Feedback Items</h1>
          {appParam && (
            <span className="text-xs text-primary font-medium">{APP_TYPES[appParam]}</span>
          )}
        </div>
        <p className="text-muted-foreground mt-1">
          {idParam
            ? '1 item'
            : total > 0
              ? `${total} item${total !== 1 ? 's' : ''}${isDateView ? ` on ${fromParam === toParam || !toParam ? fromParam : `${fromParam} – ${toParam}`}` : ''}`
              : 'No items'}
          {!idParam && !isDateView && ' extracted from your integrations'}
        </p>
      </div>

      {/* Filters — hidden when viewing a single item or date-scoped view */}
      {!idParam && !isDateView && (
      <div className="flex flex-wrap items-end gap-3 mb-6">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search feedback..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <CompanyFilter
          value={companyFilter}
          options={allCustomers}
          onChange={setCompanyFilter}
        />
        {currentUser && (
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground font-medium px-0.5">Assigned</span>
            <button
              onClick={() => setAssignedToFilter(assignedToFilter === currentUser ? '' : currentUser)}
              className={`h-9 px-3 rounded-md text-xs font-medium border transition-colors ${
                assignedToFilter === currentUser
                  ? 'bg-primary/15 text-primary border-primary/30'
                  : 'bg-background text-muted-foreground border-input hover:text-foreground'
              }`}
            >
              <UserCircle className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />
              My Items
            </button>
          </div>
        )}
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground font-medium px-0.5">
            {appParam === 'service' ? 'Service Areas' : appParam === 'churn_risk' ? 'Churn Reasons' : 'Product Areas'}
          </span>
          <Select value={tagFilter} onValueChange={(v) => setTagFilter(v ?? '')}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder={appParam === 'service' ? 'All Service Areas' : appParam === 'churn_risk' ? 'All Churn Reasons' : 'All Product Areas'} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">{appParam === 'service' ? 'All Service Areas' : appParam === 'churn_risk' ? 'All Churn Reasons' : 'All Product Areas'}</SelectItem>
              {(appParam === 'service' ? SERVICE_TAGS : appParam === 'churn_risk' ? CHURN_TAGS : PRODUCT_TAGS).map((tag) => (
                <SelectItem key={tag} value={tag}>{tag}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground font-medium px-0.5">Feedback Types</span>
          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v ?? '')}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="All Feedback Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All Feedback Types</SelectItem>
              <SelectItem value="issue">Issues</SelectItem>
              <SelectItem value="praise">Praises</SelectItem>
              <SelectItem value="feature_request">Feature Requests</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground font-medium px-0.5">Level of Urgency</span>
          <Select value={urgencyFilter} onValueChange={(v) => setUrgencyFilter(v ?? '')}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="All Urgency Levels" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All Urgency Levels</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch('')
              setTypeFilter('')
              setUrgencyFilter('')
              setTagFilter('')
              setAssignedToFilter('')
              setCompanyFilter('')
            }}
          >
            Clear filters
          </Button>
        )}
      </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted-foreground">
              {total === 0
                ? 'No feedback items yet. Sync your integrations from the Integrations page.'
                : 'No items match your filters.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <Card key={item.id} className="overflow-hidden">
              <div
                className="flex items-start gap-3 p-4 cursor-pointer hover:bg-muted/30 transition-colors"
                onClick={() => setExpanded(expanded === item.id ? null : item.id)}
              >
                <div className="mt-0.5 shrink-0">{typeIcon(item.type)}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{item.title}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <p className="text-xs text-muted-foreground">
                      {item.customer}
                      {item.rep !== 'Unknown' ? ` · ${item.rep}` : ''} · {item.date}
                    </p>
                    {(item.tags ?? []).map((tag) => (
                      <TagBadge key={tag} tag={tag} />
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {item.assignedTo && (
                    <span
                      className="hidden sm:flex items-center justify-center w-5 h-5 rounded-full bg-primary/20 text-primary text-[9px] font-bold shrink-0"
                      title={`Assigned to ${item.assignedTo}`}
                    >
                      {item.assignedTo.slice(0, 2).toUpperCase()}
                    </span>
                  )}
                  {!appParam && (
                    <AppTypeBadge appType={item.appType} />
                  )}
                  {(() => {
                    const src = SOURCE_LOGOS[item.source]
                    const url = buildSourceUrl(item)
                    return src ? (
                      url ? (
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={src.alt}
                          className="hidden sm:flex shrink-0"
                        >
                          <img src={src.logo} alt={src.alt} width={16} height={16} className="rounded-sm opacity-80 hover:opacity-100 transition-opacity" />
                        </a>
                      ) : (
                        <img src={src.logo} alt={src.alt} width={16} height={16} className="hidden sm:block rounded-sm opacity-80" />
                      )
                    ) : null
                  })()}
                  <Badge variant="outline" className="text-xs hidden sm:flex">
                    {typeLabel(item.type)}
                  </Badge>
                  <Badge variant={urgencyColor(item.urgency)} className="text-xs">
                    {item.urgency}
                  </Badge>
                  {expanded === item.id ? (
                    <ChevronUp className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  )}
                </div>
              </div>

              {expanded === item.id && (
                <div className="border-t bg-muted/20 px-4 py-4">
                  {/* Edit / Save / Cancel controls */}
                  <div className="flex items-center justify-end mb-3">
                    {editing === item.id ? (
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="ghost" onClick={cancelEdit} disabled={saving} className="h-7 gap-1.5 text-xs">
                          <XIcon className="w-3 h-3" /> Cancel
                        </Button>
                        <Button size="sm" onClick={() => saveEdit(item.id)} disabled={saving} className="h-7 gap-1.5 text-xs">
                          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Save
                        </Button>
                      </div>
                    ) : (
                      <button
                        onClick={(e) => { e.stopPropagation(); startEdit(item) }}
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                        title="Edit this item"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        Edit
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3 text-xs">
                    {/* App row — spans 4 cols when in edit mode */}
                    {editing === item.id && editDraft ? (
                      <div className="col-span-2 sm:col-span-4">
                        <p className="text-muted-foreground mb-1">Application</p>
                        <div className="flex flex-wrap gap-1.5">
                          {(Object.entries(APP_TYPES) as [AppType, string][]).map(([value, label]) => (
                            <button
                              key={value}
                              type="button"
                              onClick={() => setEditDraft((d) => d ? { ...d, appType: value } : d)}
                              className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium transition-all border ${
                                editDraft.appType === value
                                  ? 'bg-primary/20 text-primary border-primary/40'
                                  : 'bg-muted/40 text-muted-foreground border-transparent hover:border-muted'
                              }`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="col-span-2 sm:col-span-4">
                        <p className="text-muted-foreground mb-0.5">Application</p>
                        <p className="font-medium">{APP_TYPES[item.appType ?? 'product']}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-muted-foreground mb-0.5">Source</p>
                      <div className="flex items-center gap-1.5">
                        {SOURCE_LOGOS[item.source] && (
                          <img src={SOURCE_LOGOS[item.source].logo} alt={SOURCE_LOGOS[item.source].alt} width={14} height={14} className="rounded-sm" />
                        )}
                        {buildSourceUrl(item) ? (
                          <a
                            href={buildSourceUrl(item)!}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium flex items-center gap-1 hover:underline"
                          >
                            {sourceLabel(item.source)}
                            <ExternalLink className="w-3 h-3 opacity-60" />
                          </a>
                        ) : (
                          <p className="font-medium">{sourceLabel(item.source)}</p>
                        )}
                      </div>
                    </div>
                    <div>
                      <p className="text-muted-foreground mb-1">Type</p>
                      {editing === item.id && editDraft ? (
                        <select
                          value={editDraft.type}
                          onChange={(e) => setEditDraft((d) => d ? { ...d, type: e.target.value as FeedbackType } : d)}
                          className="h-7 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring [color-scheme:dark]"
                        >
                          <option value="issue">Issue</option>
                          <option value="praise">Praise</option>
                          <option value="feature_request">Feature Request</option>
                        </select>
                      ) : (
                        <p className="font-medium">{typeLabel(item.type)}</p>
                      )}
                    </div>
                    <div>
                      <p className="text-muted-foreground mb-1">Customer</p>
                      {editing === item.id && editDraft ? (
                        <input
                          value={editDraft.customer}
                          onChange={(e) => setEditDraft((d) => d ? { ...d, customer: e.target.value } : d)}
                          className="h-7 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                      ) : (
                        <p className="font-medium">{item.customer}</p>
                      )}
                    </div>
                    <div>
                      <p className="text-muted-foreground mb-1">Zeni Rep</p>
                      {editing === item.id && editDraft ? (
                        <input
                          value={editDraft.rep}
                          onChange={(e) => setEditDraft((d) => d ? { ...d, rep: e.target.value } : d)}
                          className="h-7 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                      ) : (
                        <p className="font-medium">{item.rep}</p>
                      )}
                    </div>
                  </div>

                  {/* Tags */}
                  {editing === item.id && editDraft ? (
                    <div className="mb-3">
                      <p className="text-xs text-muted-foreground mb-1.5">
                        {editDraft.appType === 'service' ? 'Service Areas' : editDraft.appType === 'churn_risk' ? 'Churn Reasons' : 'Product Areas'}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {(TAGS_BY_APP_TYPE[editDraft.appType ?? 'product'] as readonly string[]).map((tag) => {
                          const selected = editDraft.tags.includes(tag)
                          const colors = TAG_COLORS[tag] ?? { bg: 'rgba(100,100,100,0.15)', text: '#aaa' }
                          return (
                            <button
                              key={tag}
                              type="button"
                              onClick={() => toggleTag(tag)}
                              className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium transition-opacity"
                              style={{
                                background: selected ? colors.bg : 'rgba(100,100,100,0.08)',
                                color: selected ? colors.text : '#666',
                                outline: selected ? `1px solid ${colors.text}40` : '1px solid transparent',
                              }}
                            >
                              {tag}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ) : (item.tags ?? []).length > 0 ? (
                    <div className="flex items-center gap-1.5 flex-wrap mb-3">
                      <span className="text-xs text-muted-foreground">Product areas:</span>
                      {(item.tags ?? []).map((tag) => (
                        <TagBadge key={tag} tag={tag} />
                      ))}
                    </div>
                  ) : null}

                  <p className="text-sm leading-relaxed">{item.description}</p>

                  {/* Assignment */}
                  <div className="mt-3">
                    <AssigneeSelector
                      assignedTo={item.assignedTo}
                      users={users}
                      onAssign={(email) => saveAssignment(item.id, email)}
                    />
                  </div>

                  <div className="flex items-end justify-between mt-3">
                    <p className="text-xs text-muted-foreground">
                      Source ID: <span className="font-mono">{item.rawSourceId}</span> · Analyzed {new Date(item.analyzedAt).toLocaleString()}
                    </p>
                    <button
                      onClick={(e) => { e.stopPropagation(); setDrawerItem(item) }}
                      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0 ml-4"
                    >
                      <MessageSquarePlus className="w-3.5 h-3.5" />
                      Feedback
                    </button>
                  </div>

                  {/* Training section */}
                  <div className="mt-4 pt-4 border-t border-border/60">
                    <p className="text-xs font-medium text-muted-foreground mb-2.5">Train Classifier</p>
                    <div className="flex flex-col gap-2">
                      <select
                        value={trainState[item.id]?.action ?? ''}
                        onChange={(e) =>
                          setTrainState((prev) => ({
                            ...prev,
                            [item.id]: { ...prev[item.id], action: e.target.value, notes: prev[item.id]?.notes ?? '' },
                          }))
                        }
                        className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring [color-scheme:dark]"
                      >
                        <option value="">Select an action…</option>
                        <option value="remove">Remove — not useful feedback</option>
                        <option value="move:product">Move to Product Feedback</option>
                        <option value="move:service">Move to Service Feedback</option>
                        <option value="move:churn_risk">Move to Churn Risk</option>
                      </select>
                      {trainState[item.id]?.action && (
                        <>
                          <textarea
                            rows={2}
                            placeholder="Why? Your notes help train future classifications… (required)"
                            value={trainState[item.id]?.notes ?? ''}
                            onChange={(e) =>
                              setTrainState((prev) => ({
                                ...prev,
                                [item.id]: { ...prev[item.id], notes: e.target.value },
                              }))
                            }
                            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none [color-scheme:dark]"
                          />
                          <div className="flex justify-end">
                            <button
                              onClick={(e) => { e.stopPropagation(); submitTraining(item) }}
                              disabled={!trainState[item.id]?.notes?.trim()}
                              className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              Apply Training
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <FeedbackDrawer
        item={drawerItem}
        open={drawerItem !== null}
        onClose={() => setDrawerItem(null)}
      />
    </div>
  )
}
