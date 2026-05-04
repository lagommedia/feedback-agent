'use client'

import { useState, useEffect, useCallback, useRef, useMemo, Suspense } from 'react'
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
import { AlertCircle, ThumbsUp, Lightbulb, ChevronDown, ChevronUp, Search, Loader2, Pencil, Check, X as XIcon, MessageSquarePlus, ExternalLink, UserCircle, Building2, Sparkles } from 'lucide-react'
import type { FeedbackItem, FeedbackSource, FeedbackType, UrgencyLevel, AppType, WorkflowStatus, ActionItem, ChargebeeCustomer } from '@/types'
import type { ChurnScore } from '@/lib/storage'
import { PRODUCT_TAGS, SERVICE_TAGS, CHURN_TAGS, TAGS_BY_APP_TYPE, APP_TYPES } from '@/types'
import { FeedbackDrawer } from '@/components/feedback/feedback-drawer'
import { bestChargebeeMatch } from '@/lib/name-match'
import { isAiCustomer } from '@/lib/ai-customers'

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
  if (type === 'recommendation') return 'Recommendation'
  return type.charAt(0).toUpperCase() + type.slice(1)
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
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
        >
          + Assign
        </button>
      )}
    </div>
  )
}

function CompanyAssignWidget({
  company,
  assignedTo,
  users,
  onAssign,
}: {
  company: string
  assignedTo: string | null
  users: { email: string }[]
  onAssign: (company: string, assignedTo: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} className="relative" onClick={e => e.stopPropagation()}>
      {assignedTo ? (
        <div className="flex items-center gap-1">
          <span
            className="flex items-center justify-center w-6 h-6 rounded-full bg-violet-500/20 text-violet-400 text-[9px] font-bold cursor-pointer hover:bg-violet-500/30 transition-colors"
            title={`Company assigned to ${assignedTo}`}
            onClick={() => setOpen(o => !o)}
          >
            {assignedTo.slice(0, 2).toUpperCase()}
          </span>
        </div>
      ) : (
        <button
          onClick={() => setOpen(o => !o)}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
        >
          <UserCircle className="w-3 h-3" /> Assign
        </button>
      )}
      {open && (
        <div className="absolute right-0 top-full mt-1 w-52 bg-popover border border-border rounded-lg shadow-lg z-50 py-1 max-h-48 overflow-y-auto">
          {assignedTo && (
            <button
              onClick={() => { onAssign(company, null); setOpen(false) }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left text-destructive hover:bg-muted/50 transition-colors"
            >
              <XIcon className="w-3 h-3" /> Remove assignment
            </button>
          )}
          {users.map(u => (
            <button
              key={u.email}
              onClick={() => { onAssign(company, u.email); setOpen(false) }}
              className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-muted/50 transition-colors ${u.email === assignedTo ? 'text-primary font-medium' : ''}`}
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
  )
}

function ChurnScoreBar({ score, confidence }: { score: number; confidence: 'high' | 'medium' | 'low' }) {
  // score=0 means no risk (green), score=100 means certain churn (red)
  const scoreColor = score >= 65 ? '#ef4444' : score >= 35 ? '#f59e0b' : '#22c55e'

  const confMap = {
    high:   { bg: 'rgba(34,197,94,0.12)',  text: '#4ade80',  label: 'High' },
    medium: { bg: 'rgba(245,158,11,0.12)', text: '#fbbf24',  label: 'Med' },
    low:    { bg: 'rgba(148,163,184,0.1)', text: '#94a3b8',  label: 'Low' },
  }
  const conf = confMap[confidence] ?? confMap.low

  return (
    <div
      className="flex items-center gap-2 shrink-0 select-none"
      title={`Churn risk score: ${score}/100 · Confidence: ${confidence}`}
      onClick={e => e.stopPropagation()}
    >
      {/* Gradient scale bar + needle */}
      <div className="flex flex-col items-center gap-1">
        <div
          className="relative w-[72px] h-1.5 rounded-full overflow-visible"
          style={{ background: 'linear-gradient(to right, #22c55e 0%, #f59e0b 50%, #ef4444 100%)' }}
        >
          {/* Needle */}
          <div
            className="absolute -top-[3px] w-[3px] h-[9px] rounded-full bg-white shadow-[0_0_0_1.5px_rgba(0,0,0,0.4)]"
            style={{ left: `clamp(0%, ${score}%, 100%)`, transform: 'translateX(-50%)' }}
          />
        </div>
      </div>
      {/* Score number */}
      <span className="text-[11px] font-bold tabular-nums w-6 text-right" style={{ color: scoreColor }}>
        {score}
      </span>
      {/* Confidence pill */}
      <span
        className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
        style={{ background: conf.bg, color: conf.text }}
      >
        {conf.label}
      </span>
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

  const filtered = options
    .filter((c) => c.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
    .slice(0, 50)

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

const WORKFLOW_STAGES: { value: WorkflowStatus; label: string }[] = [
  { value: 'reviewed',    label: 'Reviewed' },
  { value: 'action_plan', label: 'Action Plan' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed',   label: 'Completed' },
]

function WorkflowStatusBar({
  item,
  onUpdate,
}: {
  item: FeedbackItem
  onUpdate: (updates: { workflowStatus?: WorkflowStatus | ''; reviewedNotes?: string; actionItems?: ActionItem[] }) => void
}) {
  const status = item.workflowStatus
  const currentIndex = status ? WORKFLOW_STAGES.findIndex((s) => s.value === status) : -1

  const [openPanel, setOpenPanel] = useState<WorkflowStatus | null>(null)
  const [notesDraft, setNotesDraft] = useState(item.reviewedNotes ?? '')
  const [newActionText, setNewActionText] = useState('')
  const [actionDraft, setActionDraft] = useState<ActionItem[]>(item.actionItems ?? [])

  useEffect(() => {
    setNotesDraft(item.reviewedNotes ?? '')
    setActionDraft(item.actionItems ?? [])
    setOpenPanel(null)
  }, [item.id])

  function handleStageClick(stage: WorkflowStatus) {
    if (status === stage) {
      setOpenPanel(openPanel === stage ? null : stage)
    } else {
      onUpdate({ workflowStatus: stage })
      setOpenPanel(stage)
    }
  }

  function saveNotes() {
    onUpdate({ reviewedNotes: notesDraft })
    setOpenPanel(null)
  }

  function addActionItem() {
    if (!newActionText.trim()) return
    setActionDraft((prev) => [...prev, { id: crypto.randomUUID(), text: newActionText.trim(), checked: false }])
    setNewActionText('')
  }

  function saveActionPlan() {
    if (actionDraft.length === 0) return
    onUpdate({ actionItems: actionDraft, workflowStatus: 'in_progress' })
    setOpenPanel('in_progress')
  }

  function toggleActionItem(id: string) {
    const updated = (item.actionItems ?? []).map((i) => i.id === id ? { ...i, checked: !i.checked } : i)
    const allDone = updated.length > 0 && updated.every((i) => i.checked)
    onUpdate({ actionItems: updated, ...(allDone ? { workflowStatus: 'completed' } : {}) })
  }

  return (
    <div className="mt-3 pt-3 border-t border-border/60">
      <p className="text-xs text-muted-foreground mb-2">Status</p>
      <div className="flex items-stretch gap-0">
        {WORKFLOW_STAGES.map((stage, idx) => {
          const isActive = stage.value === status
          const isPast = currentIndex >= 0 && idx < currentIndex
          const isFirst = idx === 0
          const isLast = idx === WORKFLOW_STAGES.length - 1
          const isPanelOpen = openPanel === stage.value

          let bg = 'bg-violet-500/10 text-violet-400/70 hover:bg-violet-500/20'
          if (isActive) bg = 'bg-primary text-primary-foreground'
          else if (isPast) bg = 'bg-primary/20 text-primary hover:bg-primary/30'

          return (
            <button
              key={stage.value}
              onClick={(e) => { e.stopPropagation(); handleStageClick(stage.value) }}
              className={`flex-1 px-2 py-1.5 text-[11px] font-medium transition-colors border border-border/50 ${bg} ${
                isFirst ? 'rounded-l-md' : ''
              } ${isLast ? 'rounded-r-md' : ''} ${
                !isFirst ? '-ml-px' : ''
              } ${isPanelOpen ? 'ring-1 ring-inset ring-primary/60' : ''}`}
            >
              {stage.label}
            </button>
          )
        })}
      </div>

      {/* Stage panels */}
      {openPanel && (
        <div
          className="mt-2 rounded-lg border border-border bg-background shadow-lg p-4"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Reviewed — optional notes */}
          {openPanel === 'reviewed' && (
            <div className="space-y-3">
              <p className="text-xs font-medium text-muted-foreground">
                Review Notes <span className="font-normal opacity-60">(optional)</span>
              </p>
              <textarea
                rows={3}
                value={notesDraft}
                onChange={(e) => setNotesDraft(e.target.value)}
                placeholder="Add any notes about your review…"
                className="w-full rounded-md border border-input bg-muted/30 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none [color-scheme:dark]"
              />
              <div className="flex justify-end gap-2">
                <button onClick={() => setOpenPanel(null)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
                <button onClick={saveNotes} className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors">Save</button>
              </div>
            </div>
          )}

          {/* Action Plan — build checklist */}
          {openPanel === 'action_plan' && (
            <div className="space-y-3">
              <p className="text-xs font-medium text-muted-foreground">Action Items</p>
              <div className="flex gap-2">
                <input
                  value={newActionText}
                  onChange={(e) => setNewActionText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addActionItem() } }}
                  placeholder="Add an action item…"
                  className="flex-1 h-8 rounded-md border border-input bg-muted/30 px-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <button
                  onClick={addActionItem}
                  disabled={!newActionText.trim()}
                  className="px-3 h-8 rounded-md bg-primary/20 text-primary text-xs font-medium hover:bg-primary/30 transition-colors disabled:opacity-40"
                >
                  Add
                </button>
              </div>
              {actionDraft.length > 0 && (
                <ul className="space-y-1.5">
                  {actionDraft.map((ai) => (
                    <li key={ai.id} className="flex items-center gap-2 text-xs">
                      <span className="flex-1 text-foreground">{ai.text}</span>
                      <button
                        onClick={() => setActionDraft((prev) => prev.filter((i) => i.id !== ai.id))}
                        className="text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <XIcon className="w-3 h-3" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex justify-end gap-2 pt-1 border-t border-border/40">
                <button onClick={() => setOpenPanel(null)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
                <button
                  onClick={saveActionPlan}
                  disabled={actionDraft.length === 0}
                  className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Save & Start
                </button>
              </div>
            </div>
          )}

          {/* In Progress — check off tasks */}
          {openPanel === 'in_progress' && (
            <div className="space-y-3">
              <p className="text-xs font-medium text-muted-foreground">Action Items</p>
              {(item.actionItems ?? []).length === 0 ? (
                <p className="text-xs text-muted-foreground">No action items. Go back to Action Plan to add some.</p>
              ) : (
                <ul className="space-y-2">
                  {(item.actionItems ?? []).map((ai) => (
                    <li key={ai.id} className="flex items-center gap-2.5">
                      <button
                        onClick={() => toggleActionItem(ai.id)}
                        className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                          ai.checked ? 'bg-primary border-primary' : 'border-border hover:border-primary/60'
                        }`}
                      >
                        {ai.checked && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                      </button>
                      <span className={`text-xs transition-colors ${ai.checked ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                        {ai.text}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex justify-end pt-1 border-t border-border/40">
                <button onClick={() => setOpenPanel(null)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">Close</button>
              </div>
            </div>
          )}

          {/* Completed — summary */}
          {openPanel === 'completed' && (
            <div className="space-y-3">
              <p className="text-xs font-medium" style={{ color: '#00C805' }}>All done!</p>
              {(item.actionItems ?? []).length > 0 && (
                <ul className="space-y-1.5">
                  {(item.actionItems ?? []).map((ai) => (
                    <li key={ai.id} className="flex items-center gap-2.5">
                      <div className="w-4 h-4 rounded border border-primary bg-primary flex items-center justify-center shrink-0">
                        <Check className="w-2.5 h-2.5 text-primary-foreground" />
                      </div>
                      <span className="text-xs line-through text-muted-foreground">{ai.text}</span>
                    </li>
                  ))}
                </ul>
              )}
              {item.reviewedNotes && (
                <div className="pt-2 border-t border-border/60">
                  <p className="text-xs text-muted-foreground font-medium mb-1">Review Notes</p>
                  <p className="text-xs text-muted-foreground">{item.reviewedNotes}</p>
                </div>
              )}
              <div className="flex justify-end pt-1 border-t border-border/40">
                <button onClick={() => setOpenPanel(null)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">Close</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function AssignedFilter({
  value,
  users,
  currentUser,
  onChange,
}: {
  value: string
  users: { email: string }[]
  currentUser: string | null
  onChange: (v: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const filtered = users.filter((u) =>
    u.email.toLowerCase().includes(query.toLowerCase())
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
      <span className="text-xs text-muted-foreground font-medium px-0.5">Assigned</span>

      {value && !open ? (
        <div className="flex items-center gap-1 h-9">
          <button
            onClick={() => setOpen(true)}
            className="flex items-center gap-1.5 rounded-full bg-primary/15 text-primary text-xs font-medium px-2.5 py-1 hover:bg-primary/25 transition-colors max-w-[180px]"
          >
            <span className="w-4 h-4 rounded-full bg-primary/30 flex items-center justify-center text-[9px] font-bold shrink-0">
              {value.slice(0, 2).toUpperCase()}
            </span>
            <span className="truncate">{value === currentUser ? 'My Items' : value}</span>
          </button>
          <button
            onClick={() => onChange('')}
            className="text-muted-foreground hover:text-foreground transition-colors"
            title="Clear filter"
          >
            <XIcon className="w-3 h-3" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <UserCircle className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search assignee…"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
            onFocus={() => setOpen(true)}
            className="h-9 w-44 pl-8 pr-3 rounded-md border border-input bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          {open && (
            <div className="absolute top-full mt-1 left-0 w-56 bg-popover border border-border rounded-lg shadow-lg z-50 py-1 max-h-56 overflow-y-auto">
              {/* My Items shortcut */}
              {currentUser && (
                <button
                  onClick={() => { onChange(currentUser); setOpen(false) }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-muted/50 transition-colors border-b border-border/40"
                >
                  <UserCircle className="w-3.5 h-3.5 text-primary shrink-0" />
                  <span className="text-primary font-medium">My Items</span>
                </button>
              )}
              {filtered.length === 0 ? (
                <p className="px-3 py-2 text-xs text-muted-foreground">No users found</p>
              ) : (
                filtered.map((u) => (
                  <button
                    key={u.email}
                    onClick={() => { onChange(u.email); setOpen(false) }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-muted/50 transition-colors"
                  >
                    <span className="w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center text-[9px] font-bold shrink-0">
                      {u.email.slice(0, 2).toUpperCase()}
                    </span>
                    <span className="truncate">{u.email}</span>
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
  const [expandedCompanies, setExpandedCompanies] = useState<Set<string>>(new Set())
  const [editing, setEditing] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<{ type: FeedbackType; appType: AppType; customer: string; rep: string; tags: string[] } | null>(null)
  const [saving, setSaving] = useState(false)
  const [drawerItem, setDrawerItem] = useState<FeedbackItem | null>(null)
  const [currentUser, setCurrentUser] = useState<string | null>(null)
  const [users, setUsers] = useState<{ email: string }[]>([])
  const [assignedToFilter, setAssignedToFilter] = useState<string>('')
  const [companyFilter, setCompanyFilter] = useState<string>(searchParams.get('customer') ?? '')
  const [sourceFilter, setSourceFilter] = useState<string>('')
  const [sortBy, setSortBy] = useState<string>('date_desc')
  const [allCustomers, setAllCustomers] = useState<string[]>([])
  const [chargebeeCustomers, setChargebeeCustomers] = useState<ChargebeeCustomer[]>([])
  const [companyAssignments, setCompanyAssignments] = useState<Record<string, string>>({})
  const [churnScores, setChurnScores] = useState<Record<string, ChurnScore>>({})

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(d => setCurrentUser(d.email ?? null))
    fetch('/api/users').then(r => r.json()).then(d => setUsers(d.users ?? []))
    fetch('/api/feedback/customers').then(r => r.json()).then(d => setAllCustomers(d.customers ?? []))
    fetch('/api/chargebee/customers').then(r => r.json()).then(d => setChargebeeCustomers(d.customers ?? []))
    fetch('/api/company-assignments').then(r => r.json()).then(d => setCompanyAssignments(d.assignments ?? {}))
    fetch('/api/churn-scores').then(r => r.json()).then(d => setChurnScores(d.scores ?? {}))
  }, [])

  function toggleCompany(company: string) {
    setExpandedCompanies(prev => {
      const next = new Set(prev)
      if (next.has(company)) next.delete(company)
      else next.add(company)
      return next
    })
  }

  async function assignCompany(companyName: string, assignedTo: string | null) {
    await fetch('/api/company-assignments', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyName, assignedTo }),
    })
    setCompanyAssignments(prev => {
      const next = { ...prev }
      if (!assignedTo) delete next[companyName]
      else next[companyName] = assignedTo
      return next
    })
  }

  function startEdit(item: FeedbackItem) {
    setEditing(item.id)
    setEditDraft({ type: item.type, appType: item.appType ?? 'product', customer: item.customer, rep: item.rep, tags: item.tags ?? [] })
  }

  function cancelEdit() {
    setEditing(null)
    setEditDraft(null)
  }

  function handleTrained(id: string, action: string, targetType?: string) {
    if (action === 'remove') {
      setItems((prev) => prev.filter((i) => i.id !== id))
      setExpanded(null)
    } else if (targetType) {
      setItems((prev) => prev.map((i) => i.id === id ? { ...i, appType: targetType as AppType } : i))
    }
  }

  async function updateFeedbackItem(id: string, updates: { workflowStatus?: WorkflowStatus | ''; reviewedNotes?: string; actionItems?: ActionItem[] }) {
    setItems((prev) => prev.map((i) => i.id === id ? {
      ...i,
      ...updates,
      workflowStatus: updates.workflowStatus === '' ? undefined : (updates.workflowStatus ?? i.workflowStatus),
    } : i))
    await fetch('/api/feedback', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...updates }),
    })
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
  const [appTypeFilter, setAppTypeFilter] = useState<string>(searchParams.get('app') ?? '')
  const [aiFilter, setAiFilter] = useState(false)

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
      if (sourceFilter) params.set('source', sourceFilter)
    }
    if (appParam) params.set('appType', appParam)
    if (appTypeFilter) params.set('appType', appTypeFilter)
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
  }, [idParam, isDateView, fromParam, toParam, search, typeFilter, urgencyFilter, tagFilter, appTypeFilter, assignedToFilter, companyFilter, sourceFilter, appParam, searchParams])

  useEffect(() => {
    const t = setTimeout(fetchItems, 200)
    return () => clearTimeout(t)
  }, [fetchItems])

  const hasFilters = !!(typeFilter || urgencyFilter || tagFilter || appTypeFilter || search || assignedToFilter || companyFilter || sourceFilter || aiFilter)

  // Fuzzy lookup map: feedback customer name → matched ChargebeeCustomer (or null)
  // Built once when chargebeeCustomers loads, so we don't re-run fuzzy match on every render.
  const cbLookup = useMemo(() => {
    const map = new Map<string, ChargebeeCustomer | null>()
    if (chargebeeCustomers.length === 0) return map
    const cbNames = chargebeeCustomers.map(c => c.companyName)
    const uniqueCustomers = [...new Set(items.map(i => i.customer))]
    for (const name of uniqueCustomers) {
      // Try exact match first, then fuzzy
      const exact = chargebeeCustomers.find(c => c.companyName.toLowerCase() === name.toLowerCase())
      if (exact) { map.set(name, exact); continue }
      const fuzzyName = bestChargebeeMatch(name, cbNames, 0.6)
      map.set(name, fuzzyName ? (chargebeeCustomers.find(c => c.companyName === fuzzyName) ?? null) : null)
    }
    return map
  }, [chargebeeCustomers, items])

  // Merge Chargebee canonical names (sorted by MRR) with any feedback customers
  // not found in Chargebee — so nothing disappears from the filter.
  const companyOptions = useMemo(() => {
    if (chargebeeCustomers.length === 0) return [...allCustomers].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
    const cbSet = new Set(chargebeeCustomers.map((c) => c.companyName.toLowerCase()))
    const feedbackOnly = allCustomers.filter((c) => !cbSet.has(c.toLowerCase()))
    return [...chargebeeCustomers.map((c) => c.companyName), ...feedbackOnly].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: 'base' })
    )
  }, [chargebeeCustomers, allCustomers])

  const sortedItems = useMemo(() => {
    const arr = [...items]
    switch (sortBy) {
      case 'date_asc':  return arr.sort((a, b) => a.date.localeCompare(b.date))
      case 'date_desc': return arr.sort((a, b) => b.date.localeCompare(a.date))
      case 'arr_desc': {
        const getArr = (item: FeedbackItem) => cbLookup.get(item.customer)?.arr ?? 0
        return arr.sort((a, b) => getArr(b) - getArr(a))
      }
      case 'arr_asc': {
        const getArr = (item: FeedbackItem) => cbLookup.get(item.customer)?.arr ?? 0
        return arr.sort((a, b) => getArr(a) - getArr(b))
      }
      case 'urgency': {
        const order = { high: 0, medium: 1, low: 2 }
        return arr.sort((a, b) => (order[a.urgency] ?? 1) - (order[b.urgency] ?? 1))
      }
      case 'company': return arr.sort((a, b) => a.customer.localeCompare(b.customer, undefined, { sensitivity: 'base' }))
      default: return arr
    }
  }, [items, sortBy, chargebeeCustomers])

  // Group sorted items by company
  const groupedByCompany = useMemo(() => {
    const map = new Map<string, FeedbackItem[]>()
    for (const item of sortedItems) {
      const key = item.customer || 'Unknown'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(item)
    }
    const groups = Array.from(map.entries()).map(([company, companyItems]) => {
      const cb = cbLookup.get(company) ?? null
      return {
        company,
        items: companyItems,
        cb,
        isAi: isAiCustomer(company, cb?.companyName),
      }
    })
    return aiFilter ? groups.filter(g => g.isAi) : groups
  }, [sortedItems, cbLookup, aiFilter])

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
          options={companyOptions}
          onChange={setCompanyFilter}
        />
        <AssignedFilter
          value={assignedToFilter}
          users={users}
          currentUser={currentUser}
          onChange={setAssignedToFilter}
        />
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground font-medium px-0.5">Source</span>
          <Select value={sourceFilter} onValueChange={(v) => setSourceFilter(v ?? '')}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="All Sources" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All Sources</SelectItem>
              <SelectItem value="avoma">Avoma</SelectItem>
              <SelectItem value="front">Front</SelectItem>
              <SelectItem value="slack">Slack</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground font-medium px-0.5">Application</span>
          <Select value={appTypeFilter} onValueChange={(v) => setAppTypeFilter(v ?? '')}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="All Applications" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All Applications</SelectItem>
              <SelectItem value="product">Product</SelectItem>
              <SelectItem value="service">Service</SelectItem>
              <SelectItem value="churn_risk">Churn Risk</SelectItem>
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
              <SelectItem value="recommendation">Recommendations</SelectItem>
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
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground font-medium px-0.5 invisible">AI</span>
          <button
            onClick={() => setAiFilter(f => !f)}
            className={`h-9 inline-flex items-center gap-1.5 px-3 rounded-md border text-sm font-medium transition-colors whitespace-nowrap ${
              aiFilter
                ? 'bg-violet-500/20 border-violet-500/50 text-violet-300'
                : 'border-input text-muted-foreground hover:text-foreground hover:border-primary/40'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            AI Customers
          </button>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground font-medium px-0.5">Sort By</span>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v ?? 'date_desc')}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Date (Newest)">
                {({'date_desc': 'Date (Newest)', 'date_asc': 'Date (Oldest)', 'arr_desc': 'ARR (High → Low)', 'arr_asc': 'ARR (Low → High)', 'urgency': 'Urgency', 'company': 'Company (A–Z)' } as Record<string, string>)[sortBy] ?? 'Date (Newest)'}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="date_desc">Date (Newest)</SelectItem>
              <SelectItem value="date_asc">Date (Oldest)</SelectItem>
              <SelectItem value="arr_desc">ARR (High → Low)</SelectItem>
              <SelectItem value="arr_asc">ARR (Low → High)</SelectItem>
              <SelectItem value="urgency">Urgency</SelectItem>
              <SelectItem value="company">Company (A–Z)</SelectItem>
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
              setAppTypeFilter('')
              setAssignedToFilter('')
              setCompanyFilter('')
              setSourceFilter('')
              setAiFilter(false)
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
          {groupedByCompany.map(({ company, items: companyItems, cb, isAi }) => {
            const isCompanyExpanded = expandedCompanies.has(company)
            const arrStr = cb ? (cb.arr >= 1000 ? `$${(cb.arr / 1000).toFixed(1)}k` : `$${Math.round(cb.arr)}`) : null
            const companyAssignee = companyAssignments[company]
            const churnScore = churnScores[company]
            return (
              <div key={company} className="rounded-lg border border-border overflow-hidden">
                {/* Company header */}
                <div
                  className="flex items-center gap-3 px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer"
                  onClick={() => toggleCompany(company)}
                >
                  <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">{company}</span>
                    {isAi && (
                      <span title="AI customer">
                        <Sparkles className="w-3.5 h-3.5 shrink-0 text-violet-400" />
                      </span>
                    )}
                    {arrStr && <span className="text-[11px] font-semibold text-blue-400">{arrStr} ARR</span>}
                    <span className="text-xs text-muted-foreground">{companyItems.length} ticket{companyItems.length !== 1 ? 's' : ''}</span>
                  </div>
                  {/* Churn risk heat bar */}
                  {churnScore && (
                    <ChurnScoreBar score={churnScore.score} confidence={churnScore.confidence} />
                  )}
                  {/* Company-level assignee */}
                  <CompanyAssignWidget
                    company={company}
                    assignedTo={companyAssignee ?? null}
                    users={users}
                    onAssign={assignCompany}
                  />
                  {isCompanyExpanded
                    ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
                    : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
                </div>

                {/* Tickets nested under company */}
                {isCompanyExpanded && (
                  <div className="divide-y divide-border">
                    {companyItems.map((item) => (
                      <div key={item.id}>
                        <div
                          className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-muted/20 transition-colors"
                          onClick={() => setExpanded(expanded === item.id ? null : item.id)}
                        >
                          <div className="mt-0.5 shrink-0">{typeIcon(item.type)}</div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">{item.title}</p>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              <p className="text-xs text-muted-foreground">
                                {item.rep !== 'Unknown' ? `${item.rep} · ` : ''}{item.date}
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
                            {!appParam && <AppTypeBadge appType={item.appType} />}
                            {(() => {
                              const src = SOURCE_LOGOS[item.source]
                              const url = buildSourceUrl(item)
                              return src ? (
                                url ? (
                                  <a href={url} target="_blank" rel="noopener noreferrer" title={src.alt} className="hidden sm:flex shrink-0" onClick={e => e.stopPropagation()}>
                                    <img src={src.logo} alt={src.alt} width={16} height={16} className="rounded-sm opacity-80 hover:opacity-100 transition-opacity" />
                                  </a>
                                ) : (
                                  <img src={src.logo} alt={src.alt} width={16} height={16} className="hidden sm:block rounded-sm opacity-80" />
                                )
                              ) : null
                            })()}
                            <Badge variant="outline" className="text-xs hidden sm:flex">{typeLabel(item.type)}</Badge>
                            <Badge variant={urgencyColor(item.urgency)} className="text-xs">{item.urgency}</Badge>
                            {expanded === item.id
                              ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
                              : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
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
                        <p className="text-muted-foreground mb-1">Feedback Type</p>
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
                          <option value="recommendation">Recommendation</option>
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
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium">{item.customer}</p>
                          {(() => {
                            const cb = cbLookup.get(item.customer)
                            if (!cb) return null
                            const arr = cb.arr >= 1000 ? `$${(cb.arr / 1000).toFixed(1)}k` : `$${Math.round(cb.arr)}`
                            return (
                              <span className="text-[10px] font-semibold text-blue-400">
                                {arr} ARR
                              </span>
                            )
                          })()}
                        </div>
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

                  {/* Workflow Status Bar — shown when item is assigned */}
                  {item.assignedTo && (
                    <WorkflowStatusBar
                      item={item}
                      onUpdate={(updates) => updateFeedbackItem(item.id, updates)}
                    />
                  )}

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
                </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )})}
        </div>
      )}

      <FeedbackDrawer
        item={drawerItem}
        open={drawerItem !== null}
        onClose={() => setDrawerItem(null)}
        onTrained={handleTrained}
      />
    </div>
  )
}
