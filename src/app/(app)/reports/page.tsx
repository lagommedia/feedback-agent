'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { FileText, Download, Loader2, Copy, ChevronDown, ChevronUp, Users, TrendingUp, TrendingDown, Minus, Activity, RefreshCw } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import type { ReportRequest, FeedbackItem, WorkflowStatus } from '@/types'

// ─── Churn Risk Tracker ────────────────────────────────────────────────────────

interface ChurnScoreDelta {
  companyName: string
  arr: number
  mrr: number
  initialScore: number
  initialConfidence: string
  initialReasoning: string
  initialScoredAt: string
  latestScore: number
  latestConfidence: string
  latestReasoning: string
  latestScoredAt: string
  delta: number
  snapshotCount: number
}

function ScoreBar({ score }: { score: number }) {
  const color = score >= 65 ? '#ef4444' : score >= 35 ? '#f59e0b' : '#22c55e'
  return (
    <div className="flex items-center gap-2">
      <div
        className="relative w-16 h-1.5 rounded-full overflow-visible shrink-0"
        style={{ background: 'linear-gradient(to right, #22c55e 0%, #f59e0b 50%, #ef4444 100%)' }}
      >
        <div
          className="absolute -top-[3px] w-[3px] h-[9px] rounded-full bg-white shadow-[0_0_3px_rgba(0,0,0,0.5)]"
          style={{ left: `clamp(0%,${score}%,100%)`, transform: 'translateX(-50%)' }}
        />
      </div>
      <span className="text-xs font-bold tabular-nums w-6 text-right" style={{ color }}>{score}</span>
    </div>
  )
}

function ConfidencePill({ conf }: { conf: string }) {
  const map: Record<string, { bg: string; text: string; label: string }> = {
    high:   { bg: 'rgba(34,197,94,0.12)',  text: '#4ade80', label: 'High' },
    medium: { bg: 'rgba(245,158,11,0.12)', text: '#fbbf24', label: 'Med' },
    low:    { bg: 'rgba(148,163,184,0.1)', text: '#94a3b8', label: 'Low' },
  }
  const c = map[conf] ?? map.low
  return (
    <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: c.bg, color: c.text }}>
      {c.label}
    </span>
  )
}

function ChurnRiskTrackerPanel() {
  const [deltas, setDeltas] = useState<ChurnScoreDelta[]>([])
  const [loading, setLoading] = useState(true)
  const [computing, setComputing] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  function load() {
    setLoading(true)
    fetch('/api/churn-scores/history')
      .then(r => r.json())
      .then(d => setDeltas(d.deltas ?? []))
      .catch(() => toast.error('Failed to load churn score history'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  function toggle(name: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })
  }

  async function computeScores() {
    setComputing(true)
    try {
      const res = await fetch('/api/churn-scores/compute', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? 'Failed to compute scores'); return }
      toast.success(`Computed scores for ${data.scored} companies`)
      load()
    } catch (err) {
      toast.error(String(err))
    } finally {
      setComputing(false)
    }
  }

  const worsening = deltas.filter(d => d.delta > 0).sort((a, b) => b.delta - a.delta)
  const improving = deltas.filter(d => d.delta < 0).sort((a, b) => a.delta - b.delta)
  const unchanged = deltas.filter(d => d.delta === 0)

  // Weighted ranking: delta × log(ARR+1000) × score level factor
  // log scale on ARR prevents large accounts from totally dominating
  function riskWeight(d: ChurnScoreDelta)        { return Math.abs(d.delta) * Math.log2((d.arr || 0) + 1000) * (1 + d.latestScore  / 100) }
  function improvementWeight(d: ChurnScoreDelta) { return Math.abs(d.delta) * Math.log2((d.arr || 0) + 1000) * (1 + d.initialScore / 100) }

  const allRisk    = [...worsening].sort((a, b) => riskWeight(b)        - riskWeight(a))
  const allImprove = [...improving].sort((a, b) => improvementWeight(b) - improvementWeight(a))

  function fmtArr(arr: number) {
    if (!arr) return null
    if (arr >= 1000) return `$${(arr / 1000).toFixed(arr >= 10000 ? 0 : 1)}k ARR`
    return `$${Math.round(arr)} ARR`
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  function RiskRow({ d, rank, accent, sign }: { d: ChurnScoreDelta; rank: number; accent: string; sign: string }) {
    const isOpen = expanded.has(d.companyName)
    const absDelta = Math.abs(d.delta)
    const isTop5 = rank <= 5

    return (
      <div className="border-b border-white/5 last:border-0">
        <div
          className="flex items-center gap-2.5 py-2.5 cursor-pointer hover:bg-white/5 rounded-lg px-1 -mx-1 transition-colors"
          onClick={() => toggle(d.companyName)}
        >
          <span
            className="text-[11px] font-bold w-5 shrink-0 text-right tabular-nums"
            style={{ color: isTop5 ? accent : '#64748b' }}
          >
            #{rank}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-sm font-semibold">{d.companyName}</span>
              <span className="text-xs font-bold" style={{ color: accent }}>{sign}{absDelta} pts</span>
            </div>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              <ScoreBar score={d.initialScore} />
              <span className="text-[9px] text-muted-foreground">→</span>
              <ScoreBar score={d.latestScore} />
              {fmtArr(d.arr) && <span className="text-[10px] text-muted-foreground">· {fmtArr(d.arr)}</span>}
            </div>
          </div>
          {isOpen
            ? <ChevronUp   className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
        </div>

        {isOpen && (
          <div className="pb-3 px-1">
            <div className="rounded-lg bg-black/20 p-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wide mb-1.5 flex items-center gap-1">
                  Baseline · {formatDate(d.initialScoredAt)} <ConfidencePill conf={d.initialConfidence} />
                </p>
                <p className="text-xs text-foreground/80 leading-relaxed">{d.initialReasoning || '—'}</p>
              </div>
              <div>
                <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wide mb-1.5 flex items-center gap-1">
                  Latest · {formatDate(d.latestScoredAt)} <ConfidencePill conf={d.latestConfidence} />
                </p>
                <p className="text-xs text-foreground/80 leading-relaxed">{d.latestReasoning || '—'}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  if (loading) return (
    <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
      <Loader2 className="w-4 h-4 animate-spin" /> Loading churn risk history…
    </div>
  )

  if (deltas.length === 0) return (
    <div className="rounded-lg border border-dashed border-border p-6 text-center space-y-3">
      <p className="text-sm text-muted-foreground">
        No reassessments yet. Run <strong>Compute Scores</strong> below to set a baseline, then run it again after
        customer follow-ups to track risk changes.
      </p>
      <Button onClick={computeScores} disabled={computing} className="gap-2">
        {computing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
        {computing ? 'Computing…' : 'Compute Scores Now'}
      </Button>
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {deltas.length} compan{deltas.length === 1 ? 'y' : 'ies'} reassessed ·{' '}
          <span className="text-red-400 font-medium">{worsening.length} worsening</span>
          {' · '}
          <span className="text-emerald-400 font-medium">{improving.length} improving</span>
          {unchanged.length > 0 && <span className="text-muted-foreground"> · {unchanged.length} unchanged</span>}
        </p>
        <Button size="sm" variant="outline" onClick={computeScores} disabled={computing} className="gap-1.5 h-8">
          {computing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          {computing ? 'Computing…' : 'Reassess Now'}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Increasing Risk — full scrollable list */}
        {allRisk.length > 0 && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/5 flex flex-col">
            <div className="px-4 pt-4 pb-2 shrink-0">
              <p className="text-[11px] font-bold text-red-400 uppercase tracking-wide flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5" /> Increasing Risk ({allRisk.length})
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Ranked by ARR × score change · click any row to see why</p>
            </div>
            <div className="overflow-y-auto max-h-[480px] px-4 pb-4">
              {allRisk.map((d, i) => (
                <RiskRow key={d.companyName} d={d} rank={i + 1} accent="#f87171" sign="+" />
              ))}
            </div>
          </div>
        )}

        {/* Improving — full scrollable list */}
        {allImprove.length > 0 && (
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 flex flex-col">
            <div className="px-4 pt-4 pb-2 shrink-0">
              <p className="text-[11px] font-bold text-emerald-400 uppercase tracking-wide flex items-center gap-1.5">
                <TrendingDown className="w-3.5 h-3.5" /> Improving ({allImprove.length})
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Ranked by ARR × score change · click any row to see why</p>
            </div>
            <div className="overflow-y-auto max-h-[480px] px-4 pb-4">
              {allImprove.map((d, i) => (
                <RiskRow key={d.companyName} d={d} rank={i + 1} accent="#34d399" sign="−" />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const STAGE_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  reviewed:    { label: 'Reviewed',    color: 'text-violet-400',  bg: 'bg-violet-500/10 border border-violet-500/20' },
  action_plan: { label: 'Action Plan', color: 'text-blue-400',    bg: 'bg-blue-500/10 border border-blue-500/20' },
  in_progress: { label: 'In Progress', color: 'text-yellow-400',  bg: 'bg-yellow-500/10 border border-yellow-500/20' },
  completed:   { label: 'Completed',   color: 'text-emerald-400', bg: 'bg-emerald-500/10 border border-emerald-500/20' },
  none:        { label: 'Not Started', color: 'text-muted-foreground', bg: 'bg-muted/40' },
}

const URGENCY_COLOR: Record<string, string> = {
  high: 'text-red-400', medium: 'text-yellow-400', low: 'text-muted-foreground',
}

function TeamAssignmentsPanel() {
  const [items, setItems] = useState<FeedbackItem[]>([])
  const [companyAssignments, setCompanyAssignments] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [expandedTickets, setExpandedTickets] = useState<Set<string>>(new Set())

  useEffect(() => {
    Promise.all([
      fetch('/api/feedback?limit=2000').then(r => r.json()),
      fetch('/api/company-assignments').then(r => r.json()),
    ]).then(([fd, ca]) => {
      setItems((fd.items ?? []).filter((i: FeedbackItem) => i.assignedTo))
      setCompanyAssignments(ca.assignments ?? {})
    }).finally(() => setLoading(false))
  }, [])

  function toggle(email: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(email) ? next.delete(email) : next.add(email)
      return next
    })
  }

  function toggleTicket(id: string) {
    setExpandedTickets(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // Group tickets by assignee
  const byAssignee = new Map<string, FeedbackItem[]>()
  for (const item of items) {
    const key = item.assignedTo!
    if (!byAssignee.has(key)) byAssignee.set(key, [])
    byAssignee.get(key)!.push(item)
  }

  // Also gather company-level assignments
  const companiesByAssignee = new Map<string, string[]>()
  for (const [company, email] of Object.entries(companyAssignments)) {
    if (!companiesByAssignee.has(email)) companiesByAssignee.set(email, [])
    companiesByAssignee.get(email)!.push(company)
  }

  // All unique assignees across both
  const allAssignees = [...new Set([...byAssignee.keys(), ...companiesByAssignee.keys()])].sort()

  const stageCounts = (ticketList: FeedbackItem[]) => {
    const counts: Record<string, number> = { none: 0, reviewed: 0, action_plan: 0, in_progress: 0, completed: 0 }
    for (const t of ticketList) counts[t.workflowStatus ?? 'none']++
    return counts
  }

  if (loading) return (
    <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
      <Loader2 className="w-4 h-4 animate-spin" /> Loading team assignments…
    </div>
  )

  if (allAssignees.length === 0) return (
    <p className="text-sm text-muted-foreground py-4">No tickets or companies have been assigned yet.</p>
  )

  return (
    <div className="space-y-2">
      {allAssignees.map(email => {
        const tickets = byAssignee.get(email) ?? []
        const companies = companiesByAssignee.get(email) ?? []
        const isOpen = expanded.has(email)
        const counts = stageCounts(tickets)
        const initials = email.slice(0, 2).toUpperCase()

        return (
          <div key={email} className="rounded-lg border border-border overflow-hidden">
            {/* Assignee header */}
            <div
              className="flex items-center gap-3 px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer"
              onClick={() => toggle(email)}
            >
              <span className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                {initials}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{email}</p>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <span className="text-xs text-muted-foreground">{tickets.length} ticket{tickets.length !== 1 ? 's' : ''}</span>
                  {companies.length > 0 && (
                    <span className="text-xs text-muted-foreground">· {companies.length} company account{companies.length !== 1 ? 's' : ''}</span>
                  )}
                  {/* Stage pill summary */}
                  {Object.entries(counts).filter(([, n]) => n > 0).map(([stage, n]) => (
                    <span key={stage} className={cn('inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold', STAGE_CONFIG[stage].bg, STAGE_CONFIG[stage].color)}>
                      {n} {STAGE_CONFIG[stage].label}
                    </span>
                  ))}
                </div>
              </div>
              {isOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
            </div>

            {/* Expanded content */}
            {isOpen && (
              <div className="divide-y divide-border">
                {/* Company accounts */}
                {companies.length > 0 && (
                  <div className="px-4 py-3 bg-muted/10">
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Company Accounts</p>
                    <div className="flex flex-wrap gap-1.5">
                      {companies.map(c => (
                        <span key={c} className="inline-flex items-center rounded-full px-2 py-0.5 text-xs bg-muted/60 text-foreground">{c}</span>
                      ))}
                    </div>
                  </div>
                )}
                {/* Tickets */}
                {tickets.length > 0 && (
                  <div>
                    <div className="px-4 pt-3 pb-1">
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Tickets</p>
                    </div>
                    {tickets.map(ticket => {
                      const stage = ticket.workflowStatus ?? 'none'
                      const stageConf = STAGE_CONFIG[stage]
                      const isTicketOpen = expandedTickets.has(ticket.id)
                      return (
                        <div key={ticket.id} className="border-t border-border/50 first:border-t-0">
                          {/* Ticket summary row */}
                          <div
                            className="flex items-start gap-3 px-4 py-2.5 cursor-pointer hover:bg-muted/20 transition-colors"
                            onClick={() => toggleTicket(ticket.id)}
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium">{ticket.title}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {ticket.customer}{ticket.rep !== 'Unknown' ? ` · ${ticket.rep}` : ''} · {ticket.date}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className={cn('text-xs font-medium', URGENCY_COLOR[ticket.urgency])}>{ticket.urgency}</span>
                              <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold', stageConf.bg, stageConf.color)}>
                                {stageConf.label}
                              </span>
                              {isTicketOpen
                                ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
                                : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
                            </div>
                          </div>
                          {/* Expanded ticket detail */}
                          {isTicketOpen && (
                            <div className="px-4 pb-3 pt-0 bg-muted/10 border-t border-border/40">
                              {ticket.description && (
                                <p className="text-sm text-foreground/80 leading-relaxed mb-2">{ticket.description}</p>
                              )}
                              <div className="flex flex-wrap items-center gap-2">
                                {(ticket.tags ?? []).map(tag => (
                                  <span key={tag} className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium bg-muted/60 text-muted-foreground">{tag}</span>
                                ))}
                                {ticket.reviewedNotes && (
                                  <span className="text-xs text-muted-foreground italic">Notes: {ticket.reviewedNotes}</span>
                                )}
                              </div>
                              {(ticket.actionItems ?? []).length > 0 && (
                                <div className="mt-2 space-y-1">
                                  {ticket.actionItems!.map(ai => (
                                    <div key={ai.id} className="flex items-center gap-2 text-xs">
                                      <span className={ai.checked ? 'text-emerald-400' : 'text-muted-foreground'}>
                                        {ai.checked ? '✓' : '○'}
                                      </span>
                                      <span className={ai.checked ? 'line-through text-muted-foreground' : ''}>{ai.text}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

const REPORT_TYPES: { value: ReportRequest['type']; label: string; description: string }[] = [
  {
    value: 'weekly_summary',
    label: 'Weekly Summary',
    description: 'High-level overview of all feedback this week, organized by type and urgency',
  },
  {
    value: 'issues_deep_dive',
    label: 'Issues Deep Dive',
    description: 'Detailed analysis of all issues, patterns, and recommended fixes',
  },
  {
    value: 'praises',
    label: 'Praises & Wins',
    description: 'Positive feedback and what customers love about Zeni',
  },
  {
    value: 'feature_requests',
    label: 'Recommendations',
    description: 'Customer recommendations ranked by frequency and business impact',
  },
  {
    value: 'custom',
    label: 'Custom Report',
    description: 'Write your own prompt for a custom analysis',
  },
]

export default function ReportsPage() {
  const [reportType, setReportType] = useState<ReportRequest['type']>('weekly_summary')
  const [customPrompt, setCustomPrompt] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [generating, setGenerating] = useState(false)
  const [report, setReport] = useState('')

  async function generateReport() {
    setGenerating(true)
    setReport('')

    const body: ReportRequest = {
      type: reportType,
      ...(reportType === 'custom' ? { customPrompt } : {}),
      ...(dateFrom && dateTo ? { dateRange: { from: dateFrom, to: dateTo } } : {}),
    }

    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const err = await res.json()
        toast.error(err.error ?? 'Failed to generate report')
        return
      }

      const reader = res.body?.getReader()
      if (!reader) return

      const decoder = new TextDecoder()
      let accumulated = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        accumulated += decoder.decode(value, { stream: true })
        setReport(accumulated)
      }
    } catch (err) {
      toast.error(String(err))
    } finally {
      setGenerating(false)
    }
  }

  function copyReport() {
    navigator.clipboard.writeText(report)
    toast.success('Report copied to clipboard')
  }

  function downloadReport() {
    const blob = new Blob([report], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `zeni-feedback-report-${reportType}-${new Date().toISOString().split('T')[0]}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  const selectedType = REPORT_TYPES.find((r) => r.value === reportType)

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Reports</h1>
        <p className="text-muted-foreground mt-1">
          Generate AI-powered reports from your product feedback data
        </p>
      </div>

      {/* Team Assignments */}
      <div className="mb-10">
        <div className="flex items-center gap-2 mb-4">
          <Users className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold">Team Assignments</h2>
        </div>
        <TeamAssignmentsPanel />
      </div>

      {/* Churn Risk Tracker */}
      <div className="mb-10">
        <div className="flex items-center gap-2 mb-1">
          <Activity className="w-5 h-5 text-red-400" />
          <h2 className="text-lg font-semibold">Churn Risk Tracker</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Track how churn risk changes between assessments. Run <strong>Compute Scores</strong> on the Integrations page
          before and after customer follow-ups to measure the impact of your actions.
        </p>
        <ChurnRiskTrackerPanel />
      </div>

      <div className="mb-6">
        <h2 className="text-lg font-semibold">AI Reports</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Generate AI-powered analysis from your feedback data</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Config Panel */}
        <div className="space-y-5">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Report Type</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-1 w-full">
                {REPORT_TYPES.map((rt) => (
                  <button
                    key={rt.value}
                    onClick={() => setReportType(rt.value)}
                    className={cn(
                      'w-full text-left px-3 py-2.5 rounded-md transition-colors',
                      reportType === rt.value
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                  >
                    <p className="text-sm font-medium">{rt.label}</p>
                    <p className="text-xs opacity-70 font-normal leading-tight mt-0.5">
                      {rt.description}
                    </p>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {reportType === 'custom' && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Custom Prompt</CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  placeholder="e.g., Analyze all feedback from enterprise customers and identify the top 5 product pain points..."
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  className="min-h-[120px]"
                />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Date Range (Optional)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label htmlFor="date-from" className="text-xs">From</Label>
                <input
                  id="date-from"
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                />
              </div>
              <div>
                <Label htmlFor="date-to" className="text-xs">To</Label>
                <input
                  id="date-to"
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
                />
              </div>
            </CardContent>
          </Card>

          <Button
            onClick={generateReport}
            disabled={generating || (reportType === 'custom' && !customPrompt.trim())}
            className="w-full"
          >
            {generating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <FileText className="w-4 h-4 mr-2" />
                Generate Report
              </>
            )}
          </Button>
        </div>

        {/* Report Output */}
        <div className="lg:col-span-2">
          <Card className="h-full min-h-[500px]">
            <CardHeader className="pb-3 flex-row items-center justify-between">
              <CardTitle className="text-base">
                {report ? selectedType?.label : 'Report Output'}
              </CardTitle>
              {report && (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={copyReport}>
                    <Copy className="w-3.5 h-3.5 mr-1.5" />
                    Copy
                  </Button>
                  <Button variant="outline" size="sm" onClick={downloadReport}>
                    <Download className="w-3.5 h-3.5 mr-1.5" />
                    Download
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent>
              {generating && !report ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  <span className="ml-3 text-sm text-muted-foreground">Generating report...</span>
                </div>
              ) : report ? (
                <div className="prose prose-sm max-w-none dark:prose-invert">
                  <ReactMarkdown>{report}</ReactMarkdown>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <FileText className="w-8 h-8 text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground">
                    Select a report type and click &ldquo;Generate Report&rdquo; to create an AI-powered analysis.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
